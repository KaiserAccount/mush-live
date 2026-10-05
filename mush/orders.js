(function (root) {
  var LOOP = 320;
  var CAMPS = [
    { name: "Yard", mile: 0 },
    { name: "River Ice", mile: 40 },
    { name: "Spruce Cut", mile: 95 },
    { name: "Blowout Ridge", mile: 160 },
    { name: "Night Lamp", mile: 235 },
    { name: "Village", mile: 320 }
  ];
  var DEFS = [
    {
      code: "nell-medicine",
      sort: 1,
      recipient: "Grandma Nell",
      tag: "Nell",
      need: "medicine chest",
      cargo: "medicine",
      deliverCamp: "Village",
      missLine: "Nell is still waiting on the medicine.",
      boot: "General's order. Medicine. Grandma Nell at the village. She is waiting."
    },
    {
      code: "stove-coal",
      sort: 2,
      recipient: "Cabin Hede",
      tag: "Hede",
      need: "coal sack",
      cargo: "coal",
      deliverCamp: "Spruce Cut",
      missLine: "Hede's stove is out."
    },
    {
      code: "kennel-feed",
      sort: 3,
      recipient: "Yard kennel",
      tag: "Kennel",
      need: "biscuit crate",
      cargo: "biscuit",
      deliverCamp: "River Ice",
      missLine: "The kennel dogs were not fed."
    },
    {
      code: "clinic-blankets",
      sort: 4,
      recipient: "Night clinic",
      tag: "Clinic",
      need: "blanket roll",
      cargo: "blanket",
      deliverCamp: "Night Lamp",
      missLine: "The clinic cots are bare."
    },
    {
      code: "trapper-mail",
      sort: 5,
      recipient: "Trapper Ivar",
      tag: "Ivar",
      need: "mail pouch",
      cargo: "mail",
      deliverCamp: "Blowout Ridge",
      missLine: "Ivar's mail is still on your sled."
    }
  ];

  function defByCode(code) {
    for (var i = 0; i < DEFS.length; i++) {
      if (DEFS[i].code === code) return DEFS[i];
    }
    return null;
  }

  function activeDef(state) {
    var found = state && state.activeOrder ? defByCode(state.activeOrder) : null;
    if (found) return found;
    var idx = ((state && state.ordersDelivered) || 0) % DEFS.length;
    return DEFS[idx];
  }

  function fresh() {
    return {
      pin: 0,
      dogs: 2,
      bestMile: 0,
      continuesUsed: 0,
      activeOrder: "nell-medicine",
      ordersDelivered: 0,
      misses: 0,
      missLine: "",
      missShown: true
    };
  }

  function normalize(raw) {
    var s = fresh();
    if (!raw || typeof raw !== "object") return s;
    var pin = Number(raw.pin);
    s.pin = isFinite(pin) && pin > 0 ? pin : 0;
    var dogs = Number(raw.dogs);
    s.dogs = Math.max(2, Math.min(8, isFinite(dogs) ? dogs : 2));
    var best = Number(raw.bestMile);
    s.bestMile = isFinite(best) ? Math.max(s.pin, best) : s.pin;
    var cont = Number(raw.continuesUsed);
    s.continuesUsed = Math.max(0, Math.min(2, isFinite(cont) ? cont : 0));
    var delivered = Number(raw.ordersDelivered);
    s.ordersDelivered = isFinite(delivered) && delivered > 0 ? Math.floor(delivered) : 0;
    var misses = Number(raw.misses);
    s.misses = isFinite(misses) && misses > 0 ? Math.floor(misses) : 0;
    var code = raw.activeOrder || DEFS[s.ordersDelivered % DEFS.length].code;
    s.activeOrder = defByCode(code) ? code : DEFS[s.ordersDelivered % DEFS.length].code;
    s.missLine = typeof raw.missLine === "string" ? raw.missLine : "";
    s.missShown = raw.missShown === true || !s.missLine;
    return s;
  }

  function line(state) {
    var d = activeDef(normalize(state));
    return d.tag + " · " + d.cargo + " · " + d.deliverCamp;
  }

  function event(name, camp, order) {
    var campName = camp || "";
    var orderCode = order || "";
    return { name: name, payload: { camp: campName, order: orderCode } };
  }

  function boot(state) {
    var s = normalize(state);
    var texts = [];
    if (s.missLine && !s.missShown) {
      texts.push(s.missLine);
      s.missShown = true;
    }
    var d = activeDef(s);
    if (d.boot && s.ordersDelivered === 0 && texts.indexOf(d.boot) === -1) {
      texts.push(d.boot);
    }
    return {
      state: s,
      texts: texts,
      events: [event("boot", campNameAt(s.pin), s.activeOrder)]
    };
  }

  function markerList(maxMile) {
    var mile = Number(maxMile) || 0;
    var out = [];
    if (mile >= 0) out.push({ name: "Yard", mile: 0 });
    var limit = Math.floor(mile / LOOP) + 1;
    for (var i = 0; i <= limit; i++) {
      for (var c = 1; c < CAMPS.length; c++) {
        var m = i * LOOP + CAMPS[c].mile;
        if (m <= mile + 1e-6) out.push({ name: CAMPS[c].name, mile: m });
      }
    }
    out.sort(function (a, b) { return a.mile - b.mile; });
    return out;
  }

  function campNameAt(mile) {
    var markers = markerList(mile);
    return markers.length ? markers[markers.length - 1].name : "Yard";
  }

  function campsCrossed(afterMile, toMile) {
    var from = Number(afterMile) || 0;
    return markerList(toMile).filter(function (m) { return m.mile > from + 1e-4; });
  }

  function cycleMile(mile) {
    var m = Number(mile) || 0;
    if (m <= 0) return 0;
    var mod = m % LOOP;
    return mod === 0 ? LOOP : mod;
  }

  function nextDeliverMile(state, fromMile) {
    var camp = activeDef(state).deliverCamp;
    var from = Number(fromMile) || 0;
    var best = null;
    var limit = Math.floor(from / LOOP) + 3;
    for (var i = 0; i <= limit; i++) {
      for (var c = 0; c < CAMPS.length; c++) {
        if (CAMPS[c].name !== camp) continue;
        var m = i * LOOP + CAMPS[c].mile;
        if (m + 1e-4 >= from && (best === null || m < best)) best = m;
      }
    }
    return best;
  }

  function deliverDistance(state, mile) {
    var target = nextDeliverMile(state, mile);
    if (target === null) return null;
    return target - mile;
  }

  function onCamp(state, camp) {
    var s = normalize(state);
    var d = activeDef(s);
    var events = [event("camp", camp.name, s.activeOrder)];
    var texts = ["Camp planted · " + camp.name];
    var delivered = null;
    if (camp.name === d.deliverCamp) {
      delivered = { orderCode: d.code, status: "delivered", mile: camp.mile };
      s.ordersDelivered += 1;
      s.activeOrder = DEFS[s.ordersDelivered % DEFS.length].code;
      events.push(event("deliver", camp.name, d.code));
      if (camp.name === "Village") {
        texts.push("Village door. The trail does not end — next stretch is the pad. Pin holds.");
      } else {
        texts.push(d.recipient + " has the " + d.cargo + ".");
      }
    }
    if (camp.mile > s.pin) s.pin = camp.mile;
    if (camp.mile > s.bestMile) s.bestMile = camp.mile;
    return { state: s, events: events, texts: texts, delivered: delivered };
  }

  function onFail(state, campName, mile) {
    var s = normalize(state);
    var d = activeDef(s);
    var target = nextDeliverMile(s, mile);
    var missed = target === null || mile + 0.01 < target;
    var delivery = null;
    var events = [];
    if (missed) {
      s.misses += 1;
      s.missLine = d.missLine;
      s.missShown = false;
      delivery = { orderCode: d.code, status: "missed", mile: mile };
      events.push(event("miss", campName, d.code));
    }
    return { state: s, events: events, delivery: delivery, missed: missed };
  }

  function onContinue(state, campName) {
    var s = normalize(state);
    if (s.continuesUsed < 2) s.continuesUsed += 1;
    return {
      state: s,
      capped: s.continuesUsed >= 2,
      events: [event("continue", campName, s.activeOrder)]
    };
  }

  function onSit(state, campName) {
    var s = normalize(state);
    return { state: s, events: [event("sit", campName, s.activeOrder)] };
  }

  function weights(state) {
    var sort = normalize(state).ordersDelivered + 1;
    if (sort >= 2) return { branch: 0.72, wind: 1.35, gust: 0.62 };
    return { branch: 0.45, wind: 1, gust: 0.85 };
  }

  function mergeRemote(local, remote) {
    var base = normalize(local);
    if (!remote) return base;
    var next = normalize({
      pin: remote.pin_mile,
      dogs: remote.dogs_unlocked,
      bestMile: remote.best_mile,
      continuesUsed: remote.continues_used,
      activeOrder: remote.active_order,
      ordersDelivered: remote.orders_delivered,
      misses: remote.misses,
      missLine: base.missLine,
      missShown: base.missShown
    });
    if ((Number(remote.misses) || 0) > base.misses && !next.missLine) {
      next.missLine = activeDef(next).missLine;
      next.missShown = false;
    }
    if (base.pin > next.pin) {
      next.pin = base.pin;
      next.bestMile = Math.max(next.bestMile, base.bestMile, base.pin);
    }
    return next;
  }

  function toRow(state, deviceId) {
    var s = normalize(state);
    return {
      device_id: deviceId,
      pin_mile: s.pin,
      best_mile: Math.max(s.bestMile, s.pin),
      dogs_unlocked: s.dogs,
      continues_used: s.continuesUsed,
      active_order: s.activeOrder,
      orders_delivered: s.ordersDelivered,
      misses: s.misses
    };
  }

  root.MushOrders = {
    LOOP: LOOP,
    CAMPS: CAMPS,
    DEFS: DEFS,
    fresh: fresh,
    normalize: normalize,
    activeDef: activeDef,
    line: line,
    boot: boot,
    markerList: markerList,
    campNameAt: campNameAt,
    campsCrossed: campsCrossed,
    cycleMile: cycleMile,
    nextDeliverMile: nextDeliverMile,
    deliverDistance: deliverDistance,
    onCamp: onCamp,
    onFail: onFail,
    onContinue: onContinue,
    onSit: onSit,
    weights: weights,
    mergeRemote: mergeRemote,
    toRow: toRow
  };
})(typeof window !== "undefined" ? window : global);
