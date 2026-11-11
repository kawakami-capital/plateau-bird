// 純粋な計算：UIと試験で共用（距離・属性・太陽位置）。外部通信なし。
export const known = v => typeof v === 'number' && Number.isFinite(v) && v >= 0;
export function heightClass(height, target) {
  if (!known(height)) return 'unknown';
  if (!known(target)) return 'uncompared';
  if (height > target + 0.1) return 'higher';
  if (height < target - 0.1) return 'lower';
  return 'equal';
}
export function neighborhood(rows, target, radius) {
  const nearby = rows.filter(r => r.id !== target.id && Math.hypot(r.x-target.x,r.z-target.z) <= radius);
  const uses = {}; let higher=0, unknown=0;
  for (const r of nearby) {
    uses[r.usage || '不明']=(uses[r.usage || '不明'] || 0)+1;
    if (!known(r.height)) unknown++;
    if (heightClass(r.height,target.height)==='higher') higher++;
  }
  return {count:nearby.length,higher:known(target.height)?higher:null,unknown,uses,ids:nearby.map(r=>r.id)};
}
// NOAAの近似式：年内日・時刻から均時差と赤緯を計算。
// 時刻はJST固定、方位は北=0°・東=90°。屈折補正なし。
export function solarPosition(date, hour, lat=35.6652, lon=139.7572) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(hour) || hour<0 || hour>23.99) throw new Error('日付または時刻が不正です');
  const d=new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0,10)!==date) throw new Error('日付が不正です');
  const day=Math.floor((d-Date.UTC(d.getUTCFullYear(),0,1))/86400000)+1;
  const leap=(Date.UTC(d.getUTCFullYear()+1,0,1)-Date.UTC(d.getUTCFullYear(),0,1))/86400000;
  const g=2*Math.PI/leap*(day-1+(hour-12)/24);
  const eq=229.18*(0.000075+0.001868*Math.cos(g)-0.032077*Math.sin(g)-0.014615*Math.cos(2*g)-0.040849*Math.sin(2*g));
  const dec=0.006918-0.399912*Math.cos(g)+0.070257*Math.sin(g)-0.006758*Math.cos(2*g)+0.000907*Math.sin(2*g)-0.002697*Math.cos(3*g)+0.00148*Math.sin(3*g);
  const rad=Math.PI/180, phi=lat*rad;
  const ha=(hour*60+eq+4*lon-9*60)/4-180;
  const h=ha*rad;
  const altitude=Math.asin(Math.max(-1,Math.min(1,Math.sin(phi)*Math.sin(dec)+Math.cos(phi)*Math.cos(dec)*Math.cos(h))));
  const azimuth=(Math.atan2(Math.sin(h),Math.cos(h)*Math.sin(phi)-Math.tan(dec)*Math.cos(phi))/rad+180+360)%360;
  return {altitude:altitude/rad,azimuth,equationOfTime:eq,declination:dec/rad};
}
