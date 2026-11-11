/* 町丁選択とライブ見積もり（試作・テスト決済） */
(() => {
  const COST = {
    labor_yen_per_hour: 4000,
    setup_hours: 1.5,
    hours_per_building: 1 / 2000,
    hours_per_km2: 0.25,
    min_hours: 1.5,
    hosting_views_included: 2000,
    r2_storage_usd_per_gb_month: 0.015,
    r2_months_allocated: 12,
    r2_ops_yen_buffer: 200,
    usd_jpy: 150,
    bytes_per_building: 348000000 / 37155,
    ai_yen_per_image: 150,
    ai_minutes_per_image: 8,
    ai_labor_yen_per_hour: 5000,
    ai_buildings_per_image: 80,
    ai_images_min: 12,
    ai_images_max: 80,
    video_hours: 2.0,
    video_yen_per_hour: 4000,
    fee_rate: 0.036,
    margin: 0.50,
    min_price: 16000,
    quote_price: 400000,
    quote_km2: 15.0,
    quote_buildings: 40000,
    tax_rate: 0.10,
  };

  const yen = (n) => (n == null ? "—" : `${Math.round(n).toLocaleString("ja-JP")}円`);
  const ceilThousand = (n) => Math.ceil(n / 1000) * 1000;
  const taxOf = (price) => Math.round(price * COST.tax_rate);
  const incOf = (price) => price + taxOf(price);

  function quote(buildings, areaKm2, ai, video, forceQuote) {
    const laborH = Math.max(COST.min_hours, COST.setup_hours + buildings * COST.hours_per_building + areaKm2 * COST.hours_per_km2);
    const labor = laborH * COST.labor_yen_per_hour;
    const gb = (buildings * COST.bytes_per_building) / (1024 ** 3);
    const host = gb * COST.r2_storage_usd_per_gb_month * COST.r2_months_allocated * COST.usd_jpy + COST.r2_ops_yen_buffer;
    let aiN = 0, aiCost = 0;
    if (ai) {
      aiN = Math.max(COST.ai_images_min, Math.min(COST.ai_images_max, Math.ceil((buildings || COST.ai_images_min) / COST.ai_buildings_per_image)));
      aiCost = aiN * COST.ai_yen_per_image + aiN * (COST.ai_minutes_per_image / 60) * COST.ai_labor_yen_per_hour;
    }
    const videoCost = video ? COST.video_hours * COST.video_yen_per_hour : 0;
    const costEx = labor + host + aiCost + videoCost;
    const raw = costEx / (1 - COST.margin - COST.fee_rate);
    const price = Math.max(COST.min_price, ceilThousand(raw));
    const isQuote = !!(forceQuote || price >= COST.quote_price || areaKm2 >= COST.quote_km2 || buildings >= COST.quote_buildings);
    const fee = price * COST.fee_rate;
    const cost = costEx + fee;
    const profit = price - cost;
    return {
      laborH, labor, host, aiN, aiCost, videoCost, costEx, raw, price, fee, cost, profit,
      margin: price ? profit / price : 0, isQuote, minApplied: !isQuote && price === COST.min_price && raw < COST.min_price,
    };
  }

  const state = {
    data: null,
    maps: {},
    selected: new Set(),
    city: "港区",
    ai: false,
    video: false,
    internal: false,
    stripe: null,
    supporters: null,
    payUrl: null,
  };

  const $ = (id) => document.getElementById(id);

  function areaById(id) {
    return state.data.areas.find((a) => a.id === id);
  }

  function selectedUnits() {
    return [...state.selected].map(areaById).filter(Boolean);
  }

  function rankOf(units) {
    const b = units.reduce((s, u) => s + u.buildings, 0);
    const lod2 = units.reduce((s, u) => s + u.lod2, 0);
    const tex = units.reduce((s, u) => s + u.textured, 0);
    const known = units.some((u) => u.textured_known);
    if (!b) return { rank: "—", note: "この範囲の棟数は未実測です。金額は自動計算できません。" };
    if (lod2 === 0) return { rank: "C", note: "実測の範囲ではLOD1（箱型）が中心です。" };
    let note = "";
    if (known && b && tex / b < 0.5) note = "外観つきの棟が半分未満の可能性があります。";
    if (!known) note = (note ? note + " " : "") + "町丁ごとの外観の有無は推定です。カタログ上テクスチャありでも、範囲によっては外観が少ないことがあります。";
    return { rank: "A", note };
  }

  function wholeWardSelected(units) {
    if (!units.length) return false;
    const ward = units[0].ward, code = units[0].code;
    const all = state.data.areas.filter((a) => a.code === code && a.ward === ward);
    return all.length > 0 && all.every((a) => state.selected.has(a.id)) && units.length === all.length;
  }

  function renderPrice() {
    const units = selectedUnits();
    const box = $("priceBox");
    if (!units.length) {
      box.innerHTML = `<p class="note">地図または一覧から、市・区・町名・丁目を選んでください。複数の選択もできます。</p>`;
      $("reqBtn").disabled = true;
      $("reqBtn").textContent = "この内容でリクエスト";
      return;
    }
    const buildings = units.reduce((s, u) => s + u.buildings, 0);
    const area = units.reduce((s, u) => s + u.area_km2, 0);
    const measured = units.every((u) => u.measured) && buildings > 0;
    const forceQuote = !measured || wholeWardSelected(units) && units.some((u) => !u.measured);
    const q = quote(buildings, area, state.ai, state.video, forceQuote || !measured);
    const rk = rankOf(units);
    const names = units.map((u) => `${u.ward || ""}${u.s_name}`).slice(0, 12);
    const more = units.length > 12 ? ` ほか${units.length - 12}件` : "";
    const badge = measured && !q.isQuote ? "既変換範囲の実測" : "推定を含む／個別見積もり";
    const priceHtml = q.isQuote
      ? `<div class="price">個別見積もり <small>税別</small></div>`
      : `<div class="price">${yen(q.price)} <small>税別</small></div>
         <div class="price-break">
           <div>消費税（10%）<span>${yen(taxOf(q.price))}</span></div>
           <div class="inc">税込 <span>${yen(incOf(q.price))}</span></div>
         </div>`;
    const warn = rk.note ? `<div class="warnbox">${rk.note}</div>` : "";
    const minNote = q.minApplied ? `<p class="note">小さな範囲でも準備の手間があるため、下限（税別16,000円）を適用しています。</p>` : "";
    let inner = `
      ${priceHtml}
      <div class="stats">
        <div>棟数 <b>${buildings.toLocaleString("ja-JP")}</b> ${measured ? "" : "<span class='note'>（未実測の町丁は0のまま）</span>"}</div>
        <div>品質ランク <span class="rank${rk.rank}">${rk.rank}</span></div>
        <div>面積（町丁の合計） <b>${area.toFixed(3)} km²</b></div>
        <div>根拠 <b>${badge}</b></div>
      </div>
      ${warn}
      ${minNote}
      ${(!q.isQuote && testPayUrl(q.price, state.ai, state.video, buildings)) ? `<p class="note">この内容（京都駅周辺・標準）は、Stripeのテスト決済へ進めます。本番の課金は発生しません。</p>` : (q.isQuote ? "" : `<p class="note">税込額は消費税10%（標準税率）を税別金額に加算した額です。この組み合わせのテスト決済リンクは、京都駅周辺の標準変換のみ用意しています。</p>`)}
      <p class="chips">選択中（${units.length}）: ${names.join("、")}${more}</p>
    `;
    if (state.internal) {
      if (q.isQuote) {
        inner += `<div class="internal"><p>全区・全市や、未実測の町丁を含む選択は自動計算の対象外です。下の数字は参考にも使いません。</p></div>`;
      } else {
        inner += `<div class="internal">
          <h3>内部用の内訳（お客さまには出しません）</h3>
          <table>
            <tr><th>売上（税別）</th><td>${yen(q.price)}</td></tr>
            <tr><th>費用（合計）</th><td>${yen(q.cost)}</td></tr>
            <tr><th>　作業（推定 ${q.laborH.toFixed(2)} 時間）</th><td>${yen(q.labor)}</td></tr>
            <tr><th>　配信（R2・12か月分の目安）</th><td>${yen(q.host)}</td></tr>
            <tr><th>　AI鮮明化（推定 ${q.aiN || 0} 枚）</th><td>${yen(q.aiCost)}</td></tr>
            <tr><th>　動画</th><td>${yen(q.videoCost)}</td></tr>
            <tr><th>　決済手数料 3.6%</th><td>${yen(q.fee)}</td></tr>
            <tr><th>利益</th><td>${yen(q.profit)}</td></tr>
            <tr><th>利益率</th><td>${(q.margin * 100).toFixed(1)}%</td></tr>
          </table>
          <p>利益率は売上の50%を目標に、費用÷0.464を千円単位で切り上げています。下限を適用すると50%を超えることがあります。作業時間は未実測の仮定です。</p>
        </div>`;
      }
    }
    box.innerHTML = inner;
    $("reqBtn").disabled = false;
    $("reqBtn").textContent = q.isQuote ? "この内容で見積もりを依頼" : "この内容でリクエスト";
  }

  function treeHtml() {
    const city = state.city;
    let units = state.data.areas.filter((a) => a.ward === city || a.muni === city || (city === "札幌市" && a.muni === "札幌市") || (city === "京都市" && a.muni === "京都市") || (city === "港区" && a.ward === "港区") || (city === "中央区" && a.ward === "中央区") || (city === "札幌市中央区" && a.muni === "札幌市"));
    if (city === "札幌市中央区" || city === "札幌市") units = state.data.areas.filter((a) => a.code === "01101");
    if (city === "港区") units = state.data.areas.filter((a) => a.code === "13103");
    if (city === "中央区") units = state.data.areas.filter((a) => a.code === "13102");
    const q = $("q").value.trim();
    if (q) {
      units = state.data.areas.filter((a) => [a.s_name, a.town, a.ward, a.muni, ...(a.aliases || [])].join(" ").includes(q) || (a.aliases || []).some((x) => x.includes(q)));
    }
    const byTown = new Map();
    for (const u of units) {
      const key = `${u.ward}||${u.town || u.s_name}`;
      if (!byTown.has(key)) byTown.set(key, []);
      byTown.get(key).push(u);
    }
    let html = "";
    const entries = [...byTown.entries()].sort((a, b) => {
      const aOn = a[1].some((u) => state.selected.has(u.id));
      const bOn = b[1].some((u) => state.selected.has(u.id));
      if (aOn !== bOn) return aOn ? -1 : 1;
      return 0;
    }).slice(0, 400);
    for (const [key, list] of entries) {
      const [ward, town] = key.split("||");
      const allOn = list.every((u) => state.selected.has(u.id));
      const someOn = list.some((u) => state.selected.has(u.id));
      html += `<details${(q || someOn) ? " open" : ""}><summary><label><input type="checkbox" data-town="${key}" ${allOn ? "checked" : ""}>${ward}${town}（${list.length}）</label></summary>`;
      for (const u of list.sort((a, b) => (a.chome_n || 0) - (b.chome_n || 0) || a.s_name.localeCompare(b.s_name, "ja"))) {
        html += `<label><input type="checkbox" data-id="${u.id}" ${state.selected.has(u.id) ? "checked" : ""}>${u.chome || u.s_name}　${u.buildings ? u.buildings + "棟" : "未実測"}</label>`;
      }
      html += `</details>`;
    }
    if (units.length > 400 && !q) html += `<p class="note">表示は先頭の町名グループまでです。検索するか、地図で選んでください。</p>`;
    $("tree").innerHTML = html || `<p class="note">該当する町丁がありません。</p>`;
  }

  // ---- map ----
  const canvas = () => $("map");
  const view = { minX: 0, minY: 0, maxX: 1, maxY: 1 };

  function setViewFrom(features) {
    let minX = 180, minY = 90, maxX = -180, maxY = -90;
    const walk = (c) => {
      if (typeof c[0] === "number") {
        minX = Math.min(minX, c[0]); maxX = Math.max(maxX, c[0]);
        minY = Math.min(minY, c[1]); maxY = Math.max(maxY, c[1]);
      } else c.forEach(walk);
    };
    features.forEach((f) => walk(f.geometry.coordinates));
    let spanX = Math.max(maxX - minX, 0.008);
    let spanY = Math.max(maxY - minY, 0.008);
    const midX = (minX + maxX) / 2, midY = (minY + maxY) / 2;
    minX = midX - spanX / 2; maxX = midX + spanX / 2;
    minY = midY - spanY / 2; maxY = midY + spanY / 2;
    const padX = spanX * 0.18, padY = spanY * 0.18;
    view.minX = minX - padX; view.maxX = maxX + padX;
    view.minY = minY - padY; view.maxY = maxY + padY;
  }

  function project(lon, lat, w, h) {
    const x = (lon - view.minX) / (view.maxX - view.minX) * w;
    const y = (1 - (lat - view.minY) / (view.maxY - view.minY)) * h;
    return [x, y];
  }

  function drawRing(ctx, ring, w, h) {
    ctx.beginPath();
    ring.forEach((p, i) => {
      const [x, y] = project(p[0], p[1], w, h);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.closePath();
  }

  function eachPoly(geom, fn) {
    if (geom.type === "Polygon") fn(geom.coordinates);
    else if (geom.type === "MultiPolygon") geom.coordinates.forEach(fn);
  }

  function drawMap() {
    const cv = canvas();
    const w = cv.width = cv.clientWidth * 2;
    const h = cv.height = cv.clientHeight * 2;
    const ctx = cv.getContext("2d");
    ctx.fillStyle = "#0a1528";
    ctx.fillRect(0, 0, w, h);
    const fc = currentMap();
    if (!fc) {
      ctx.fillStyle = "#b7b2a6";
      ctx.font = "28px sans-serif";
      ctx.fillText("この都市の境界は、この試作には読み込んでいません。", 40, h / 2);
      return;
    }
    const feats = fc.features;
    const selFeats = feats.filter((f) => state.selected.has(f.properties.id));
    // 全区など大半を選んでいるときは全市の俯瞰、一部選択のときはその付近に寄る
    setViewFrom((selFeats.length && selFeats.length < feats.length * 0.8) ? selFeats : feats);
    for (const f of feats) {
      const sel = state.selected.has(f.properties.id);
      const meas = f.properties.measured;
      ctx.lineWidth = sel ? 2.4 : 0.6;
      ctx.strokeStyle = sel ? "#e8d6b0" : "rgba(110,168,216,.45)";
      ctx.fillStyle = sel ? "rgba(201,166,107,.45)" : (meas ? "rgba(125,206,160,.18)" : "rgba(255,255,255,.04)");
      eachPoly(f.geometry, (rings) => {
        drawRing(ctx, rings[0], w, h);
        ctx.fill(); ctx.stroke();
      });
    }
  }

  function currentMap() {
    const city = state.city;
    if (city === "港区" || city === "中央区") return state.maps.minato;
    if (city === "京都市") return state.maps.kyoto;
    if (city === "札幌市" || city === "札幌市中央区") return state.maps.sapporo;
    return null;
  }

  function hitTest(ev) {
    const cv = canvas();
    const r = cv.getBoundingClientRect();
    const px = (ev.clientX - r.left) / r.width;
    const py = (ev.clientY - r.top) / r.height;
    const lon = view.minX + px * (view.maxX - view.minX);
    const lat = view.maxY - py * (view.maxY - view.minY);
    const fc = currentMap();
    if (!fc) return null;
    // ray-cast
    const inside = (ring, x, y) => {
      let n = 0;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
        if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) n++;
      }
      return n % 2 === 1;
    };
    for (let i = fc.features.length - 1; i >= 0; i--) {
      const f = fc.features[i];
      let hit = false;
      eachPoly(f.geometry, (rings) => { if (inside(rings[0], lon, lat)) hit = true; });
      if (hit) return f.properties.id;
    }
    return null;
  }

  function selectCity(name) {
    state.city = name;
    $("citySel").value = name;
    treeHtml();
    drawMap();
  }

  function applyPreset(id) {
    const p = state.data.presets.find((x) => x.id === id || x.label === id);
    if (!p) return;
    state.selected = new Set(p.unit_ids);
    const u0 = areaById(p.unit_ids[0]);
    if (u0) {
      if (u0.muni === "京都市") selectCity("京都市");
      else if (u0.code === "01101") selectCity("札幌市中央区");
      else if (u0.code === "13102") selectCity("中央区");
      else selectCity("港区");
    }
    renderPrice(); treeHtml(); drawMap();
  }

  function bind() {
    $("q").addEventListener("input", () => treeHtml());
    $("citySel").addEventListener("change", (e) => {
      state.city = e.target.value;
      treeHtml(); drawMap();
    });
    $("tree").addEventListener("change", (e) => {
      const t = e.target;
      if (t.dataset.id) {
        if (t.checked) state.selected.add(t.dataset.id); else state.selected.delete(t.dataset.id);
      } else if (t.dataset.town) {
        const [ward, town] = t.dataset.town.split("||");
        const list = state.data.areas.filter((a) => a.ward === ward && (a.town || a.s_name) === town);
        list.forEach((a) => t.checked ? state.selected.add(a.id) : state.selected.delete(a.id));
      }
      renderPrice(); treeHtml(); drawMap();
    });
    $("ai").addEventListener("change", (e) => { state.ai = e.target.checked; renderPrice(); });
    $("video").addEventListener("change", (e) => { state.video = e.target.checked; renderPrice(); });
    $("internal").addEventListener("change", (e) => { state.internal = e.target.checked; renderPrice(); const box=$("corporateInternal"); if(box) box.hidden=!state.internal; });
    $("selWard").addEventListener("click", () => {
      const units = state.data.areas.filter((a) =>
        (state.city === "港区" && a.code === "13103") ||
        (state.city === "中央区" && a.code === "13102") ||
        (state.city === "京都市" && a.muni === "京都市" && a.ward === "下京区") ||
        ((state.city === "札幌市中央区" || state.city === "札幌市") && a.code === "01101")
      );
      units.forEach((u) => state.selected.add(u.id));
      renderPrice(); treeHtml(); drawMap();
    });
    $("selCity").addEventListener("click", () => {
      const units = state.data.areas.filter((a) =>
        (state.city === "京都市" && a.muni === "京都市") ||
        (state.city === "港区" && a.code === "13103") ||
        (state.city === "中央区" && a.code === "13102") ||
        ((state.city === "札幌市中央区" || state.city === "札幌市") && a.muni === "札幌市")
      );
      units.forEach((u) => state.selected.add(u.id));
      renderPrice(); treeHtml(); drawMap();
    });
    $("clearBtn").addEventListener("click", () => {
      state.selected.clear(); renderPrice(); treeHtml(); drawMap();
    });
    canvas().addEventListener("click", (ev) => {
      const id = hitTest(ev);
      if (!id) return;
      if (state.selected.has(id)) state.selected.delete(id); else state.selected.add(id);
      renderPrice(); treeHtml(); drawMap();
    });
    $("reqBtn").addEventListener("click", () => {
      const units = selectedUnits();
      const buildings = units.reduce((s, u) => s + u.buildings, 0);
      const area = units.reduce((s, u) => s + u.area_km2, 0);
      const measured = units.every((u) => u.measured) && buildings > 0;
      const forceQuote = !measured || (wholeWardSelected(units) && units.some((u) => !u.measured));
      const q = quote(buildings, area, state.ai, state.video, forceQuote || !measured);
      const payUrl = !q.isQuote ? testPayUrl(q.price, state.ai, state.video, buildings) : null;
      state.payUrl = payUrl;
      const payBtn = $("payBtn");
      if (q.isQuote) {
        $("dlgBody").innerHTML = `選択は${units.length}件です。未実測の町丁を含むか範囲が広いため、この試作では個別見積もりと表示します。自動の決済には進みません。`;
        payBtn.disabled = true;
        payBtn.textContent = "個別見積もりのため決済できません";
      } else {
        const taxNote = `税別${yen(q.price)}、消費税10%（${yen(taxOf(q.price))}）、税込${yen(incOf(q.price))}`;
        const listingNote = "決済画面で、支援者名を掲載するかどうかを選べます。既定は「名前を掲載しない（匿名）」です。同意と掲載名がある場合のみ公開します。入力したメールアドレスへ、本番では街の完成後にお知らせを送ります（このテストでは送りません）。";
        if (payUrl) {
          $("dlgBody").innerHTML = `選択は${units.length}件、棟数${buildings.toLocaleString("ja-JP")}、${taxNote}です。完成後は誰でも見られる形で公開し、プログラムと変換データはオープンな利用条件で出す案です。<br><br>${listingNote}<br><br>次の画面は Stripe のテスト決済です。本番の課金は発生しません。テストカード（4242から始まる公式の番号）が使えます。`;
          payBtn.disabled = false;
          payBtn.textContent = "Stripeのテスト決済へ（本番課金なし）";
        } else {
          $("dlgBody").innerHTML = `選択は${units.length}件、棟数${buildings.toLocaleString("ja-JP")}、${taxNote}です。<br><br>${listingNote}<br><br>この組み合わせのテスト決済リンクは、まだ用意していません。京都駅周辺の標準変換（税別34,000円）はテスト決済できます。本番では、金額をその都度計算してCheckoutを作ります。`;
          payBtn.disabled = true;
          payBtn.textContent = "この金額のテスト決済は未作成";
        }
      }
      $("dlg").showModal();
    });
    $("cancelBtn").addEventListener("click", () => $("dlg").close());
    $("payBtn").addEventListener("click", () => {
      if (!state.payUrl) return;
      window.open(state.payUrl, "_blank", "noopener");
    });
    $("presets").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-preset]");
      if (b) applyPreset(b.dataset.preset);
    });
  }


  function testPayUrl(price, ai, video, buildings) {
    const ex = state.stripe && state.stripe.examples && state.stripe.examples.kyoto_station_standard;
    if (!ex) return null;
    // 京都駅周辺・標準（AI・動画なし、税別34,000円、3,922棟）だけ、用意したテストリンクを使う
    if (!ai && !video && price === ex.price_ex_tax && buildings === 3922) return ex.payment_link_url;
    return null;
  }

  function renderSupporters() {
    const data = state.supporters;
    if (!data) return;
    const chip = (s) => s.listed && s.display_name
      ? `<span class="sup-chip">${s.display_name}</span>`
      : `<span class="sup-chip anon">匿名の支援者</span>`;
    $("supOverall").innerHTML = `<p class="note">${data.disclaimer}</p><div class="sup-list">${data.overall.map(chip).join("")}</div>`;
    $("supByArea").innerHTML = data.by_area.map((a) => {
      const nAnon = a.supporters.filter((s) => !(s.listed && s.display_name)).length;
      const named = a.supporters.filter((s) => s.listed && s.display_name);
      return `<div class="area-block"><h3>${a.area}　<small>${a.status}</small></h3>
        <div class="sup-list">${named.map(chip).join("")}${nAnon ? `<span class="sup-chip anon">匿名の支援者（${nAnon}）</span>` : ""}</div></div>`;
    }).join("");
  }

  async function boot() {
    const data = await (await fetch("data/areas.json")).json();
    state.data = data;
    try {
      state.stripe = await (await fetch("data/stripe-test.json")).json();
    } catch (e) {
      state.stripe = null;
    }
    try {
      state.supporters = await (await fetch("data/supporters.json")).json();
    } catch (e) {
      state.supporters = null;
    }
    renderSupporters();
    const [minato, kyoto, sapporo] = await Promise.all([
      fetch("data/map-minato.geojson").then((r) => r.json()),
      fetch("data/map-kyoto.geojson").then((r) => r.json()),
      fetch("data/map-sapporo-chuo.geojson").then((r) => r.json()),
    ]);
    state.maps = { minato, kyoto, sapporo };
    $("presets").innerHTML = data.presets.map((p) => `<button type="button" data-preset="${p.id}">${p.label}</button>`).join("");
    bind();
    treeHtml();
    renderPrice();
    drawMap();
    window.addEventListener("resize", drawMap);
    const params = new URLSearchParams(location.search);
    if (params.get("preset")) applyPreset(params.get("preset"));
    if (params.get("internal") === "1") { state.internal = true; $("internal").checked = true; renderPrice(); const box=$("corporateInternal"); if(box) box.hidden=false; }
    if (params.get("ai") === "1") { state.ai = true; $("ai").checked = true; renderPrice(); }
    if (params.get("video") === "1") { state.video = true; $("video").checked = true; renderPrice(); }
    if (params.get("legal") === "1") document.querySelector(".legal").scrollIntoView({block:"start"});
    if (params.get("corporate") === "1") document.getElementById("corporate").scrollIntoView({block:"start"});
    if (params.get("supporters") === "1") document.getElementById("supporters").scrollIntoView({block:"start"});
    if (params.get("notify") === "1") document.getElementById("notify").scrollIntoView({block:"start"});
    if (params.get("dialog") === "1") {
      // データ適用後に確認ダイアログを開く（画面写真用）
      requestAnimationFrame(() => $("reqBtn").click());
    }
  }

  boot().catch((err) => {
    document.getElementById("priceBox").innerHTML = `<p class="warnbox">データの読み込みに失敗しました。ローカルのHTTPサーバーから開いてください。（${err}）</p>`;
  });
})();
