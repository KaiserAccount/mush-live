const fs = require("fs");
const path = require("path");
const vm = require("vm");

const sandbox = {};
sandbox.global = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, "../mush/orders.js"), "utf8"), sandbox);
const M = sandbox.MushOrders;

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error("FAIL " + msg);
  }
}

const fresh = M.fresh();
assert(M.line(fresh) === "Nell · medicine · Village", "nell line");
assert(M.activeDef(fresh).boot.indexOf("Grandma Nell") !== -1, "boot copy");

const old = M.normalize({ pin: 40, dogs: 3 });
assert(old.pin === 40 && old.dogs === 3 && old.activeOrder === "nell-medicine", "old save");

const bootMiss = M.boot({ pin: 40, dogs: 2, misses: 1, missLine: "Nell is still waiting on the medicine.", missShown: false, activeOrder: "nell-medicine" });
assert(bootMiss.texts[0] === "Nell is still waiting on the medicine.", "miss is first boot text");
assert(bootMiss.state.missShown === true, "miss shown once");
assert(bootMiss.events[0].name === "boot", "boot event");
assert(bootMiss.events[0].payload.order === "nell-medicine", "boot payload order");
assert(Object.keys(bootMiss.events[0].payload).join() === "camp,order", "payload keys");

const cleanBoot = M.boot(fresh);
assert(cleanBoot.texts[0].indexOf("General's order") === 0, "general order on clean boot");

let state = M.fresh();
let village = M.onCamp(state, { name: "Village", mile: 320 });
assert(village.delivered && village.delivered.status === "delivered", "village delivered");
assert(village.delivered.orderCode === "nell-medicine", "nell code");
assert(village.state.ordersDelivered === 1, "orders delivered");
assert(village.state.activeOrder === "stove-coal", "next order");
assert(village.state.pin === 320, "pin at village");
assert(M.line(village.state) === "Hede · coal · Spruce Cut", "hede line");
assert(village.events.map((e) => e.name).join() === "camp,deliver", "camp and deliver events");

state = village.state;
let spruce = M.onCamp(state, { name: "Spruce Cut", mile: 415 });
assert(spruce.state.activeOrder === "kennel-feed", "order 3");
state = spruce.state;
state = M.onCamp(state, { name: "River Ice", mile: 680 }).state;
state = M.onCamp(state, { name: "Night Lamp", mile: 875 }).state;
state = M.onCamp(state, { name: "Blowout Ridge", mile: 1120 }).state;
assert(state.ordersDelivered === 5, "five delivered");
assert(state.activeOrder === "nell-medicine", "loop back to nell");
assert(M.line(state) === "Nell · medicine · Village", "loop line");
assert(M.weights(M.fresh()).branch === 0.45, "order 1 weights");
assert(M.weights(village.state).branch === 0.72, "order 2 more branches");
assert(M.weights(village.state).wind === 1.35, "order 2 more wind");

let failedRun = M.onFail({ pin: 40, dogs: 4, activeOrder: "nell-medicine" }, "River Ice", 55);
assert(failedRun.missed === true, "miss before village");
assert(failedRun.delivery.status === "missed", "missed row");
assert(failedRun.state.pin === 40, "pin holds");
assert(failedRun.state.missLine === "Nell is still waiting on the medicine.", "nell miss line");
assert(failedRun.state.misses === 1, "miss count");

let after = M.onFail(village.state, "Village", 330);
assert(after.missed === true, "new order can miss");
assert(after.state.missLine === "Hede's stove is out.", "hede miss");
assert(after.state.pin === 320, "pin not snapped to yard");

let cont = M.fresh();
cont = M.onContinue(cont, "Yard").state;
cont = M.onContinue(cont, "Yard").state;
const third = M.onContinue(cont, "River Ice");
assert(third.state.continuesUsed === 2, "continues cap at 2");
assert(third.capped === true, "third continue stays capped");
assert(third.events[0].name === "continue", "continue event");

const sit = M.onSit(M.fresh(), "River Ice");
assert(sit.events[0].name === "sit", "sit event");

const crossed = M.campsCrossed(0, 40).map((c) => c.name);
assert(crossed.join() === "River Ice", "first camp is river ice");
const toVillage = M.campsCrossed(235, 320).map((c) => c.name + ":" + c.mile);
assert(toVillage.join() === "Village:320", "village plant");
const looped = M.campsCrossed(320, 360).map((c) => c.name + ":" + c.mile);
assert(looped.join() === "River Ice:360", "rail loops forward");
assert(M.nextDeliverMile(M.fresh(), 0) === 320, "nell deliver mile");
assert(M.nextDeliverMile(village.state, 320) === 415, "order 2 spruce is ahead of the pin");
assert(M.cycleMile(360) === 40, "cycle mile");

const row = M.toRow(failedRun.state, "dev-1");
assert(row.device_id === "dev-1" && row.pin_mile === 40 && row.misses === 1, "row shape");
assert(row.active_order === "nell-medicine", "row order");

if (failed) {
  console.error(failed + " failed");
  process.exit(1);
}
console.log("orders tests ok");
