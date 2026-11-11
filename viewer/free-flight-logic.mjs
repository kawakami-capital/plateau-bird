// 軽量な外接箱による移動補助。精密な建物形状・法規の判定ではない。
export const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export const MIN_ALTITUDE=36;
export const MAX_ALTITUDE=420;
export const HEIGHT_CLEARANCE=24;

export function mulberry32(seed){
  let s=seed>>>0;
  return()=>{s+=0x6D2B79F5;let t=Math.imul(s^s>>>15,1|s);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};
}

export function mapExtent(boxes,focus={x:0,z:0}){
  let x0=Infinity,x1=-Infinity,z0=Infinity,z1=-Infinity,hMax=0;
  for(const b of boxes||[]){
    if(!b)continue;
    x0=Math.min(x0,b.x0);x1=Math.max(x1,b.x1);z0=Math.min(z0,b.z0);z1=Math.max(z1,b.z1);hMax=Math.max(hMax,b.h||0);
  }
  if(!Number.isFinite(x0))return {x0:focus.x-700,x1:focus.x+700,z0:focus.z-700,z1:focus.z+700,hMax:0};
  const inset=Math.min(48,Math.max(12,Math.min(x1-x0,z1-z0)*0.06));
  return {x0:x0+inset,x1:x1-inset,z0:z0+inset,z1:z1-inset,hMax};
}

export function clearanceHeight(x,z,boxes,pad=16){
  let y=MIN_ALTITUDE;
  for(const b of boxes||[]){
    if(x>b.x0-pad&&x<b.x1+pad&&z>b.z0-pad&&z<b.z1+pad)y=Math.max(y,(b.h||0)+HEIGHT_CLEARANCE);
  }
  return y;
}

function entry(a,b,box,pad){
  const lo=[box.x0-pad,-pad,box.z0-pad],hi=[box.x1+pad,box.h+pad,box.z1+pad],p=[a.x,a.y,a.z],d=[b.x-a.x,b.y-a.y,b.z-a.z];
  if(p.every((v,i)=>v>lo[i]&&v<hi[i]))return null;
  let near=0,far=1;
  for(let i=0;i<3;i++){
    if(Math.abs(d[i])<1e-9){if(p[i]<lo[i]||p[i]>hi[i])return null;continue;}
    let x=(lo[i]-p[i])/d[i],y=(hi[i]-p[i])/d[i];
    if(x>y)[x,y]=[y,x];
    near=Math.max(near,x);far=Math.min(far,y);
    if(near>far)return null;
  }
  return near<=1&&far>=0?Math.max(0,near):null;
}

export function sweepMove(a,b,boxes,pad=8){
  let t=1;
  for(const box of boxes){
    if(Math.min(a.x,b.x)>box.x1+pad||Math.max(a.x,b.x)<box.x0-pad||Math.min(a.z,b.z)>box.z1+pad||Math.max(a.z,b.z)<box.z0-pad||Math.min(a.y,b.y)>box.h+pad)continue;
    const hit=entry(a,b,box,pad);
    if(hit!==null)t=Math.min(t,Math.max(0,hit-.002));
  }
  return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t,blocked:t<1};
}

export function stepFlight(position,delta,boxes,focus={x:0,z:0}){
  const b={x:clamp(position.x+delta.x,focus.x-1800,focus.x+1800),y:clamp(position.y+delta.y,12,1200),z:clamp(position.z+delta.z,focus.z-1800,focus.z+1800)},direct=sweepMove(position,b,boxes);
  if(!direct.blocked)return direct;
  let p={...position};
  for(const k of ['y','x','z'])p=sweepMove(p,{...p,[k]:b[k]},boxes);
  return {...p,blocked:true};
}

export function angleDiff(a,b){
  let d=b-a;
  while(d>Math.PI)d-=Math.PI*2;
  while(d<-Math.PI)d+=Math.PI*2;
  return d;
}

export function headingTo(x,z,tx,tz){
  return Math.atan2(-(tx-x),-(tz-z));
}

function ease(current,target,dt,tau){
  return current+(target-current)*(1-Math.exp(-dt/Math.max(tau,1e-4)));
}

function lookPoint(state,dist){
  return {x:state.x-Math.sin(state.yaw)*dist,z:state.z-Math.cos(state.yaw)*dist};
}

export function createBirdState({position,yaw,pitch,now=0}={}){
  const p=position||{x:0,y:120,z:0};
  return {
    x:p.x,y:p.y,z:p.z,
    yaw:yaw||0,pitch:clamp(pitch||0,-0.42,0.36),
    yawRate:0,speed:0,roll:0,
    targetYawRate:0,targetPitch:clamp(pitch||0,-0.2,0.12),targetSpeed:28,
    mode:'cruise',modeUntil:now+2400,blocked:false
  };
}

export function pickManeuver(state,rng,now,extent){
  const midX=(state.x-extent.x0)/Math.max(extent.x1-extent.x0,1);
  const midZ=(state.z-extent.z0)/Math.max(extent.z1-extent.z0,1);
  const nearEdge=midX<0.18||midX>0.82||midZ<0.18||midZ>0.82;
  const low=state.y<70,high=state.y>280;
  if(nearEdge){
    const desired=headingTo(state.x,state.z,(extent.x0+extent.x1)/2,(extent.z0+extent.z1)/2);
    const inward=angleDiff(state.yaw,desired);
    state.mode=inward>=0?'turnLeft':'turnRight';
    state.targetYawRate=clamp(inward*1.2,-0.55,0.55);
    state.targetPitch=low?0.22:-0.04;
    state.targetSpeed=26;
  }else{
    const options=['cruise','cruise','turnLeft','turnRight','weave'];
    if(!high)options.push('climb');
    if(!low)options.push('descend');
    state.mode=options[Math.floor(rng()*options.length)];
    if(state.mode==='cruise'){state.targetYawRate=(rng()-0.5)*0.12;state.targetPitch=(rng()-0.55)*0.12;state.targetSpeed=28+rng()*10;}
    else if(state.mode==='turnLeft'){state.targetYawRate=0.28+rng()*0.22;state.targetPitch=(rng()-0.5)*0.08;state.targetSpeed=24+rng()*8;}
    else if(state.mode==='turnRight'){state.targetYawRate=-(0.28+rng()*0.22);state.targetPitch=(rng()-0.5)*0.08;state.targetSpeed=24+rng()*8;}
    else if(state.mode==='climb'){state.targetYawRate=(rng()-0.5)*0.1;state.targetPitch=0.18+rng()*0.14;state.targetSpeed=20+rng()*8;}
    else if(state.mode==='descend'){state.targetYawRate=(rng()-0.5)*0.1;state.targetPitch=-(0.1+rng()*0.12);state.targetSpeed=30+rng()*8;}
    else{state.targetYawRate=0;state.targetPitch=(rng()-0.5)*0.06;state.targetSpeed=26+rng()*8;}
  }
  state.modeUntil=now+(2200+rng()*3400);
  return state;
}

export function stepBirdFlight(state,dt,boxes,focus,rng,now){
  dt=clamp(dt,0,0.05);
  const extent=mapExtent(boxes,focus);
  if(now>=state.modeUntil)pickManeuver(state,rng,now,extent);
  if(state.mode==='weave')state.targetYawRate=Math.sin(now/1000*1.15)*0.28;
  const margin=110;
  if(state.x<extent.x0+margin||state.x>extent.x1-margin||state.z<extent.z0+margin||state.z>extent.z1-margin){
    const desired=headingTo(state.x,state.z,(extent.x0+extent.x1)/2,(extent.z0+extent.z1)/2);
    state.targetYawRate=clamp(angleDiff(state.yaw,desired)*1.1,-0.6,0.6);
  }
  const look=55+state.speed*0.7;
  const ahead=lookPoint(state,look);
  const needY=clearanceHeight(ahead.x,ahead.z,boxes);
  if(needY>state.y-8)state.targetPitch=Math.max(state.targetPitch,0.28);
  const swept=sweepMove({x:state.x,y:state.y,z:state.z},{x:ahead.x,y:Math.max(state.y,needY),z:ahead.z},boxes,10);
  if(swept.blocked){
    const probe=dyaw=>{
      const y=state.yaw+dyaw;
      return sweepMove({x:state.x,y:state.y,z:state.z},{x:state.x-Math.sin(y)*look,y:state.y+20,z:state.z-Math.cos(y)*look},boxes,10);
    };
    const left=probe(0.7),right=probe(-0.7);
    if(!left.blocked&&right.blocked)state.targetYawRate=Math.max(state.targetYawRate,0.5);
    else if(!right.blocked&&left.blocked)state.targetYawRate=Math.min(state.targetYawRate,-0.5);
    else state.targetYawRate+=state.yawRate>=0?0.45:-0.45;
    state.targetPitch=Math.max(state.targetPitch,0.3);
    state.targetSpeed=Math.min(state.targetSpeed,22);
  }
  state.yawRate=ease(state.yawRate,state.targetYawRate,dt,0.95);
  state.pitch=ease(state.pitch,clamp(state.targetPitch,-0.42,0.36),dt,1.15);
  state.speed=ease(state.speed,clamp(state.targetSpeed,12,42),dt,1.35);
  state.yaw+=state.yawRate*dt;
  state.roll=ease(state.roll,clamp(-state.yawRate*0.35,-0.18,0.18),dt,0.8);
  const next=stepFlight(state,{
    x:-Math.sin(state.yaw)*Math.cos(state.pitch)*state.speed*dt,
    y:Math.sin(state.pitch)*state.speed*dt,
    z:-Math.cos(state.yaw)*Math.cos(state.pitch)*state.speed*dt
  },boxes,focus);
  const limit=(v,lo,hi,prev)=>v<lo?(prev<lo?Math.max(v,prev):lo):v>hi?(prev>hi?Math.min(v,prev):hi):v;
  let x=limit(next.x,extent.x0,extent.x1,state.x),z=limit(next.z,extent.z0,extent.z1,state.z);
  const minY=Math.max(clearanceHeight(x,z,boxes),clearanceHeight(next.x,next.z,boxes));
  let y=clamp(next.y,minY,Math.max(minY,MAX_ALTITUDE));
  const confined=sweepMove(state,{x,y,z},boxes);
  state.blocked=!!next.blocked||confined.blocked||confined.x!==next.x||confined.z!==next.z;
  if(state.blocked)state.targetSpeed=Math.min(state.targetSpeed,20);
  state.x=confined.x;state.y=confined.y;state.z=confined.z;
  return state;
}
