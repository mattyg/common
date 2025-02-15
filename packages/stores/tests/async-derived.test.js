import { expect } from "@esm-bundle/chai";
import { get, readable } from "svelte/store";
import { join, asyncReadable, asyncDerived } from "../dist-rollup";

const sleep = (ms) => new Promise((r) => setTimeout(() => r(), ms));

it("asyncReadable", async () => {
  const asyncReadableStore = asyncReadable(async (set) => {
    await sleep(10);
    set("hi");
  });
  const subscriber = asyncReadableStore.subscribe(() => {});

  expect(get(asyncReadableStore)).to.deep.equal({ status: "pending" });
  await sleep(20);

  expect(get(asyncReadableStore)).to.deep.equal({
    status: "complete",
    value: "hi",
  });
});

it("asyncDerived", async () => {
  const asyncReadableStore = asyncReadable(async (set) => {
    await sleep(10);
    set(1);
  });
  const r = readable(2);
  const d = asyncDerived(join([r, asyncReadableStore]), ([n1, n2]) => n1 + n2);
  const subscriber = d.subscribe(() => {});

  expect(get(d)).to.deep.equal({ status: "pending" });
  await sleep(20);

  expect(get(d)).to.deep.equal({ status: "complete", value: 3 });
});

it("asyncDerived with promise", async () => {
  const asyncReadableStore = asyncReadable(async (set) => {
    await sleep(10);
    set(1);
  });
  const r = readable(2);
  const d = asyncDerived(join([r, asyncReadableStore]), async ([n1, n2]) => {
    await sleep(20);
    return n1 + n2;
  });
  const subscriber = d.subscribe(() => {});

  expect(get(d)).to.deep.equal({ status: "pending" });
  await sleep(40);

  expect(get(d)).to.deep.equal({ status: "complete", value: 3 });
});
