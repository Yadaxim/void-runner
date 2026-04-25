import { UINT64_MASK } from '../constants';

function fnv1a64(input: string): bigint {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= BigInt(input.charCodeAt(i));
    hash = (hash * prime) & UINT64_MASK;
  }
  return hash;
}

export class SplitMix64 {
  private state: bigint;

  constructor(seed: number | bigint) {
    this.state = BigInt(seed) & UINT64_MASK;
  }

  private nextUint64(): bigint {
    this.state = (this.state + 0x9e3779b97f4a7c15n) & UINT64_MASK;
    let z = this.state;
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & UINT64_MASK;
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & UINT64_MASK;
    return z ^ (z >> 31n);
  }

  next(): number {
    const value = this.nextUint64() >> 11n;
    return Number(value) / 9007199254740992;
  }

  nextInt(min: number, max: number): number {
    if (max < min) throw new Error('max must be >= min');
    const span = max - min + 1;
    return min + Math.floor(this.next() * span);
  }

  nextBool(): boolean {
    return this.next() >= 0.5;
  }
}

export function childPRNG(rootSeed: number, domain: string): SplitMix64 {
  const domainHash = fnv1a64(domain);
  const combinedSeed = (BigInt(rootSeed) & UINT64_MASK) ^ domainHash;
  return new SplitMix64(combinedSeed);
}
