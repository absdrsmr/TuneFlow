import { describe, it, expect, beforeEach } from "vitest";
import { stringUtf8CV, uintCV, principalCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_SONG_ID = 101;
const ERR_INVALID_SPLIT = 102;
const ERR_INVALID_SHARE = 103;
const ERR_INVALID_AMOUNT = 104;
const ERR_INSUFFICIENT_FUNDS = 105;
const ERR_SPLIT_ALREADY_DEFINED = 106;
const ERR_SPLIT_NOT_FOUND = 107;
const ERR_INVALID_PRINCIPAL = 108;
const ERR_MAX_SPLITS_EXCEEDED = 109;
const ERR_DUPLICATE_ARTIST = 110;
const ERR_PAUSED = 111;
const ERR_INVALID_UPDATE = 112;
const ERR_UPDATE_NOT_ALLOWED = 113;
const ERR_INVALID_PAUSE_STATE = 114;
const ERR_INVALID_BASIS_POINTS = 115;
const ERR_ARITHMETIC_OVERFLOW = 116;
const ERR_ARITHMETIC_UNDERFLOW = 117;
const ERR_INVALID_MIN_SHARE = 118;
const ERR_INVALID_MAX_SHARE = 119;
const ERR_SONG_OWNER_NOT_SET = 120;

interface Split {
  artist: string;
  share: number;
}

interface SongUpdate {
  updateTimestamp: number;
  updater: string;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class RoyaltySplitterMock {
  state: {
    nextSongId: number;
    maxSplitsPerSong: number;
    basisPoints: number;
    paused: boolean;
    minShare: number;
    maxShare: number;
    admin: string;
    songSplits: Map<number, Split[]>;
    songOwners: Map<number, string>;
    songUpdates: Map<number, SongUpdate>;
    artistShares: Map<string, number>;
  } = {
    nextSongId: 0,
    maxSplitsPerSong: 10,
    basisPoints: 10000,
    paused: false,
    minShare: 1,
    maxShare: 10000,
    admin: "ST1ADMIN",
    songSplits: new Map(),
    songOwners: new Map(),
    songUpdates: new Map(),
    artistShares: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1CALLER";
  balances: Map<string, number> = new Map([["ST1CALLER", 1000000]]);

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      nextSongId: 0,
      maxSplitsPerSong: 10,
      basisPoints: 10000,
      paused: false,
      minShare: 1,
      maxShare: 10000,
      admin: "ST1ADMIN",
      songSplits: new Map(),
      songOwners: new Map(),
      songUpdates: new Map(),
      artistShares: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1CALLER";
    this.balances = new Map([["ST1CALLER", 1000000]]);
  }

  getSongSplit(songId: number): Split[] | null {
    return this.state.songSplits.get(songId) || null;
  }

  getSongOwner(songId: number): string | null {
    return this.state.songOwners.get(songId) || null;
  }

  getArtistShare(songId: number, artist: string): number | null {
    return this.state.artistShares.get(`${songId}-${artist}`) || null;
  }

  getSongUpdate(songId: number): SongUpdate | null {
    return this.state.songUpdates.get(songId) || null;
  }

  isPaused(): boolean {
    return this.state.paused;
  }

  getBasisPoints(): number {
    return this.state.basisPoints;
  }

  setAdmin(newAdmin: string): Result<boolean> {
    if (this.caller !== this.state.admin) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (newAdmin === "SP000000000000000000002Q6VF78") return { ok: false, value: ERR_INVALID_PRINCIPAL };
    this.state.admin = newAdmin;
    return { ok: true, value: true };
  }

  setPaused(state: boolean): Result<boolean> {
    if (this.caller !== this.state.admin) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (state === this.state.paused) return { ok: false, value: ERR_INVALID_PAUSE_STATE };
    this.state.paused = state;
    return { ok: true, value: true };
  }

  setBasisPoints(newBasis: number): Result<boolean> {
    if (this.caller !== this.state.admin) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (newBasis <= 0) return { ok: false, value: ERR_INVALID_BASIS_POINTS };
    this.state.basisPoints = newBasis;
    return { ok: true, value: true };
  }

  setMinShare(newMin: number): Result<boolean> {
    if (this.caller !== this.state.admin) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (newMin <= 0 || newMin > this.state.maxShare) return { ok: false, value: ERR_INVALID_MIN_SHARE };
    this.state.minShare = newMin;
    return { ok: true, value: true };
  }

  setMaxShare(newMax: number): Result<boolean> {
    if (this.caller !== this.state.admin) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (newMax < this.state.minShare || newMax > this.state.basisPoints) return { ok: false, value: ERR_INVALID_MAX_SHARE };
    this.state.maxShare = newMax;
    return { ok: true, value: true };
  }

  setMaxSplits(newMax: number): Result<boolean> {
    if (this.caller !== this.state.admin) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (newMax <= 0) return { ok: false, value: ERR_MAX_SPLITS_EXCEEDED };
    this.state.maxSplitsPerSong = newMax;
    return { ok: true, value: true };
  }

  defineSplit(songId: number, splits: Split[]): Result<boolean> {
    if (this.state.paused) return { ok: false, value: ERR_PAUSED };
    if (songId <= 0) return { ok: false, value: ERR_INVALID_SONG_ID };
    if (splits.length > this.state.maxSplitsPerSong) return { ok: false, value: ERR_MAX_SPLITS_EXCEEDED };
    const artists = new Set(splits.map(s => s.artist));
    if (artists.size !== splits.length) return { ok: false, value: ERR_DUPLICATE_ARTIST };
    for (const split of splits) {
      if (split.artist === "SP000000000000000000002Q6VF78") return { ok: false, value: ERR_INVALID_PRINCIPAL };
      if (split.share < this.state.minShare || split.share > this.state.maxShare) return { ok: false, value: ERR_INVALID_SHARE };
    }
    const total = splits.reduce((sum, s) => sum + s.share, 0);
    if (total !== this.state.basisPoints) return { ok: false, value: ERR_INVALID_SPLIT };
    if (this.state.songSplits.has(songId)) return { ok: false, value: ERR_SPLIT_ALREADY_DEFINED };
    this.state.songSplits.set(songId, splits);
    this.state.songOwners.set(songId, this.caller);
    for (const split of splits) {
      this.state.artistShares.set(`${songId}-${split.artist}`, split.share);
    }
    return { ok: true, value: true };
  }

  updateSplit(songId: number, newSplits: Split[]): Result<boolean> {
    if (this.state.paused) return { ok: false, value: ERR_PAUSED };
    if (this.state.songOwners.get(songId) !== this.caller) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (songId <= 0) return { ok: false, value: ERR_INVALID_SONG_ID };
    if (newSplits.length > this.state.maxSplitsPerSong) return { ok: false, value: ERR_MAX_SPLITS_EXCEEDED };
    const artists = new Set(newSplits.map(s => s.artist));
    if (artists.size !== newSplits.length) return { ok: false, value: ERR_DUPLICATE_ARTIST };
    for (const split of newSplits) {
      if (split.artist === "SP000000000000000000002Q6VF78") return { ok: false, value: ERR_INVALID_PRINCIPAL };
      if (split.share < this.state.minShare || split.share > this.state.maxShare) return { ok: false, value: ERR_INVALID_SHARE };
    }
    const total = newSplits.reduce((sum, s) => sum + s.share, 0);
    if (total !== this.state.basisPoints) return { ok: false, value: ERR_INVALID_SPLIT };
    if (!this.state.songSplits.has(songId)) return { ok: false, value: ERR_SPLIT_NOT_FOUND };
    this.state.songSplits.set(songId, newSplits);
    this.state.songUpdates.set(songId, { updateTimestamp: this.blockHeight, updater: this.caller });
    for (const split of newSplits) {
      this.state.artistShares.set(`${songId}-${split.artist}`, split.share);
    }
    return { ok: true, value: true };
  }

  distributeRoyalties(songId: number, amount: number): Result<number[]> {
    if (this.state.paused) return { ok: false, value: [ERR_PAUSED] };
    if (songId <= 0) return { ok: false, value: [ERR_INVALID_SONG_ID] };
    if (amount <= 0) return { ok: false, value: [ERR_INVALID_AMOUNT] };
    const splits = this.state.songSplits.get(songId);
    if (!splits) return { ok: false, value: [ERR_SPLIT_NOT_FOUND] };
    if ((this.balances.get(this.caller) || 0) < amount) return { ok: false, value: [ERR_INSUFFICIENT_FUNDS] };
    const payouts: number[] = [];
    for (const split of splits) {
      const shareAmount = Math.floor((amount * split.share) / this.state.basisPoints);
      if (shareAmount <= 0) return { ok: false, value: [ERR_ARITHMETIC_UNDERFLOW] };
      this.balances.set(this.caller, (this.balances.get(this.caller) || 0) - shareAmount);
      this.balances.set(split.artist, (this.balances.get(split.artist) || 0) + shareAmount);
      payouts.push(shareAmount);
    }
    return { ok: true, value: payouts };
  }

  getNextSongId(): Result<number> {
    return { ok: true, value: this.state.nextSongId };
  }

  incrementSongId(): Result<number> {
    this.state.nextSongId++;
    return { ok: true, value: this.state.nextSongId };
  }
}

describe("RoyaltySplitter", () => {
  let contract: RoyaltySplitterMock;

  beforeEach(() => {
    contract = new RoyaltySplitterMock();
    contract.reset();
  });

  it("defines a split successfully", () => {
    const splits = [
      { artist: "ST2ARTIST", share: 6000 },
      { artist: "ST3ARTIST", share: 4000 },
    ];
    const result = contract.defineSplit(1, splits);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const savedSplits = contract.getSongSplit(1);
    expect(savedSplits).toEqual(splits);
    expect(contract.getSongOwner(1)).toBe("ST1CALLER");
    expect(contract.getArtistShare(1, "ST2ARTIST")).toBe(6000);
    expect(contract.getArtistShare(1, "ST3ARTIST")).toBe(4000);
  });

  it("rejects duplicate artists in split", () => {
    const splits = [
      { artist: "ST2ARTIST", share: 5000 },
      { artist: "ST2ARTIST", share: 5000 },
    ];
    const result = contract.defineSplit(1, splits);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_DUPLICATE_ARTIST);
  });

  it("rejects invalid total shares", () => {
    const splits = [
      { artist: "ST2ARTIST", share: 5000 },
      { artist: "ST3ARTIST", share: 4000 },
    ];
    const result = contract.defineSplit(1, splits);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_SPLIT);
  });

  it("updates a split successfully", () => {
    const initialSplits = [
      { artist: "ST2ARTIST", share: 6000 },
      { artist: "ST3ARTIST", share: 4000 },
    ];
    contract.defineSplit(1, initialSplits);
    const newSplits = [
      { artist: "ST2ARTIST", share: 7000 },
      { artist: "ST3ARTIST", share: 3000 },
    ];
    const result = contract.updateSplit(1, newSplits);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const savedSplits = contract.getSongSplit(1);
    expect(savedSplits).toEqual(newSplits);
    const update = contract.getSongUpdate(1);
    expect(update?.updater).toBe("ST1CALLER");
    expect(contract.getArtistShare(1, "ST2ARTIST")).toBe(7000);
    expect(contract.getArtistShare(1, "ST3ARTIST")).toBe(3000);
  });

  it("rejects update by non-owner", () => {
    const splits = [
      { artist: "ST2ARTIST", share: 6000 },
      { artist: "ST3ARTIST", share: 4000 },
    ];
    contract.defineSplit(1, splits);
    contract.caller = "ST4FAKE";
    const newSplits = [
      { artist: "ST2ARTIST", share: 7000 },
      { artist: "ST3ARTIST", share: 3000 },
    ];
    const result = contract.updateSplit(1, newSplits);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("distributes royalties successfully", () => {
    const splits = [
      { artist: "ST2ARTIST", share: 6000 },
      { artist: "ST3ARTIST", share: 4000 },
    ];
    contract.defineSplit(1, splits);
    const result = contract.distributeRoyalties(1, 10000);
    expect(result.ok).toBe(true);
    expect(result.value).toEqual([6000, 4000]);
    expect(contract.balances.get("ST1CALLER")).toBe(1000000 - 10000);
    expect(contract.balances.get("ST2ARTIST")).toBe(6000);
    expect(contract.balances.get("ST3ARTIST")).toBe(4000);
  });

  it("rejects distribution with insufficient funds", () => {
    const splits = [
      { artist: "ST2ARTIST", share: 6000 },
      { artist: "ST3ARTIST", share: 4000 },
    ];
    contract.defineSplit(1, splits);
    contract.balances.set("ST1CALLER", 5000);
    const result = contract.distributeRoyalties(1, 10000);
    expect(result.ok).toBe(false);
    expect(result.value).toEqual([ERR_INSUFFICIENT_FUNDS]);
  });

  it("sets paused state successfully", () => {
    contract.caller = "ST1ADMIN";
    const result = contract.setPaused(true);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.isPaused()).toBe(true);
  });

  it("rejects set paused by non-admin", () => {
    contract.caller = "ST4FAKE";
    const result = contract.setPaused(true);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("sets basis points successfully", () => {
    contract.caller = "ST1ADMIN";
    const result = contract.setBasisPoints(20000);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.getBasisPoints()).toBe(20000);
  });

  it("rejects invalid basis points", () => {
    contract.caller = "ST1ADMIN";
    const result = contract.setBasisPoints(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_BASIS_POINTS);
  });

  it("increments song id successfully", () => {
    const result = contract.incrementSongId();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(1);
    const nextId = contract.getNextSongId();
    expect(nextId.value).toBe(1);
  });
});