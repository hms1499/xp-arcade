import { describe, it, expect } from "vitest";
import {
  makeDeck,
  dealDeck,
  createGame,
  draw,
  canMoveToFoundation,
  canStackOnTableau,
  selectableRun,
  moveCards,
  sendToFoundation,
  isWon,
  canAutoComplete,
  autoComplete,
  type PileRef,
  type Suit,
} from "./SolitaireEngine";

type SolitaireStateForTest = import("./SolitaireEngine").SolitaireState;

describe("SolitaireEngine deal", () => {
  it("makeDeck builds 52 unique cards", () => {
    const deck = makeDeck();
    expect(deck).toHaveLength(52);
    const keys = new Set(deck.map((c) => `${c.suit}${c.rank}`));
    expect(keys.size).toBe(52);
  });

  it("dealDeck lays out 28 tableau cards and the rest in stock", () => {
    const s = dealDeck(makeDeck(), 3);
    expect(s.tableau).toHaveLength(7);
    expect(s.foundations).toHaveLength(4);
    expect(s.tableau.reduce((n, p) => n + p.length, 0)).toBe(28);
    s.tableau.forEach((pile, i) => expect(pile).toHaveLength(i + 1));
    expect(s.stock).toHaveLength(24);
    expect(s.waste).toHaveLength(0);
    expect(s.drawMode).toBe(3);
    expect(s.won).toBe(false);
  });

  it("only the top card of each tableau pile is face-up", () => {
    const s = dealDeck(makeDeck(), 1);
    s.tableau.forEach((pile) => {
      pile.forEach((card, idx) =>
        expect(card.faceUp).toBe(idx === pile.length - 1),
      );
    });
    s.stock.forEach((card) => expect(card.faceUp).toBe(false));
  });

  it("createGame is deterministic under a seeded rng", () => {
    const rng = () => 0.42;
    const a = createGame(3, rng);
    const b = createGame(3, rng);
    expect(a.tableau).toEqual(b.tableau);
  });
});

describe("SolitaireEngine draw", () => {
  it("draw-3 moves up to three face-up cards to the waste", () => {
    const s = dealDeck(makeDeck(), 3);
    const after = draw(s);
    expect(after.waste).toHaveLength(3);
    expect(after.stock).toHaveLength(21);
    after.waste.forEach((c) => expect(c.faceUp).toBe(true));
  });

  it("draw-1 moves a single card", () => {
    const s = dealDeck(makeDeck(), 1);
    expect(draw(s).waste).toHaveLength(1);
  });

  it("recycles the waste back into the stock when stock is empty", () => {
    let s = dealDeck(makeDeck(), 3);
    for (let i = 0; i < 8; i++) s = draw(s); // exhaust 24-card stock
    expect(s.stock).toHaveLength(0);
    expect(s.waste).toHaveLength(24);
    const recycled = draw(s);
    expect(recycled.stock).toHaveLength(24);
    expect(recycled.waste).toHaveLength(0);
    recycled.stock.forEach((c) => expect(c.faceUp).toBe(false));
  });
});

describe("SolitaireEngine move rules", () => {
  it("foundation: empty accepts only an Ace; then same suit ascending", () => {
    expect(canMoveToFoundation({ suit: "S", rank: 1, faceUp: true }, [])).toBe(true);
    expect(canMoveToFoundation({ suit: "S", rank: 2, faceUp: true }, [])).toBe(false);
    const acePile = [{ suit: "S" as const, rank: 1, faceUp: true }];
    expect(canMoveToFoundation({ suit: "S", rank: 2, faceUp: true }, acePile)).toBe(true);
    expect(canMoveToFoundation({ suit: "H", rank: 2, faceUp: true }, acePile)).toBe(false);
  });

  it("tableau: empty accepts only a King", () => {
    expect(canStackOnTableau({ suit: "S", rank: 13, faceUp: true }, null)).toBe(true);
    expect(canStackOnTableau({ suit: "S", rank: 12, faceUp: true }, null)).toBe(false);
  });

  it("tableau: stacks one lower onto the opposite colour", () => {
    const redSeven = { suit: "H" as const, rank: 7, faceUp: true };
    expect(canStackOnTableau({ suit: "S", rank: 6, faceUp: true }, redSeven)).toBe(true);
    expect(canStackOnTableau({ suit: "C", rank: 6, faceUp: true }, redSeven)).toBe(true);
    expect(canStackOnTableau({ suit: "H", rank: 6, faceUp: true }, redSeven)).toBe(false);
    expect(canStackOnTableau({ suit: "S", rank: 5, faceUp: true }, redSeven)).toBe(false);
  });
});

describe("SolitaireEngine selectableRun", () => {
  const pile = [
    { suit: "C" as const, rank: 9, faceUp: false },
    { suit: "H" as const, rank: 8, faceUp: true },
    { suit: "S" as const, rank: 7, faceUp: true }, // alternating, descending
  ];
  const state = { ...dealDeck(makeDeck(), 1), tableau: [pile, [], [], [], [], [], []] };

  it("grabs a valid alternating descending run from the clicked index", () => {
    expect(selectableRun(state, 0, 1)).toHaveLength(2); // 8H,7S
    expect(selectableRun(state, 0, 2)).toHaveLength(1); // 7S
  });

  it("returns null for a face-down card", () => {
    expect(selectableRun(state, 0, 0)).toBeNull();
  });

  it("returns null when the run below is not a valid sequence", () => {
    const broken = [
      { suit: "H" as const, rank: 8, faceUp: true },
      { suit: "S" as const, rank: 2, faceUp: true }, // not 7 -> invalid
    ];
    const st = { ...state, tableau: [broken, [], [], [], [], [], []] };
    expect(selectableRun(st, 0, 0)).toBeNull();
  });
});

describe("SolitaireEngine moveCards", () => {
  function baseState(): SolitaireStateForTest {
    return {
      ...dealDeck(makeDeck(), 1),
      stock: [],
      waste: [{ suit: "S", rank: 1, faceUp: true }],
      foundations: [[], [], [], []],
      tableau: [
        [
          { suit: "C", rank: 5, faceUp: false },
          { suit: "H", rank: 8, faceUp: true },
        ],
        [{ suit: "S", rank: 9, faceUp: true }],
        [], [], [], [], [],
      ],
    };
  }

  it("moves waste Ace onto an empty foundation and increments moveCount", () => {
    const s = baseState();
    const from: PileRef = { kind: "waste" };
    const to: PileRef = { kind: "foundation", index: 0 };
    const after = moveCards(s, from, 0, to);
    expect(after.foundations[0]).toHaveLength(1);
    expect(after.waste).toHaveLength(0);
    expect(after.moveCount).toBe(s.moveCount + 1);
  });

  it("moves an 8H onto a 9S and flips the newly exposed tableau card", () => {
    const s = baseState();
    const from: PileRef = { kind: "tableau", index: 0 };
    const to: PileRef = { kind: "tableau", index: 1 };
    const after = moveCards(s, from, 1, to); // index 1 = the 8H
    expect(after.tableau[1].map((c) => c.rank)).toEqual([9, 8]);
    expect(after.tableau[0]).toHaveLength(1);
    expect(after.tableau[0][0].faceUp).toBe(true); // 5C flipped up
  });

  it("returns the same state for an illegal move", () => {
    const s = baseState();
    const from: PileRef = { kind: "tableau", index: 0 };
    const to: PileRef = { kind: "foundation", index: 0 };
    const after = moveCards(s, from, 1, to); // 8H cannot go to empty foundation
    expect(after).toBe(s);
  });
});

describe("SolitaireEngine sendToFoundation + isWon", () => {
  it("auto-routes a card to the first legal foundation", () => {
    const s: SolitaireStateForTest = {
      ...dealDeck(makeDeck(), 1),
      stock: [],
      waste: [{ suit: "D", rank: 1, faceUp: true }],
      foundations: [[], [], [], []],
      tableau: [[], [], [], [], [], [], []],
    };
    const after = sendToFoundation(s, { kind: "waste" }, 0);
    const total = after.foundations.reduce((n, p) => n + p.length, 0);
    expect(total).toBe(1);
    expect(after.waste).toHaveLength(0);
  });

  it("no-ops when no foundation accepts the card", () => {
    const s: SolitaireStateForTest = {
      ...dealDeck(makeDeck(), 1),
      stock: [],
      waste: [{ suit: "D", rank: 5, faceUp: true }],
      foundations: [[], [], [], []],
      tableau: [[], [], [], [], [], [], []],
    };
    expect(sendToFoundation(s, { kind: "waste" }, 0)).toBe(s);
  });

  it("isWon is true only when all 52 are on foundations", () => {
    const full = ["S", "H", "D", "C"].map((suit) =>
      Array.from({ length: 13 }, (_, i) => ({ suit: suit as Suit, rank: i + 1, faceUp: true })),
    );
    const s: SolitaireStateForTest = {
      ...dealDeck(makeDeck(), 1),
      stock: [], waste: [], tableau: [[], [], [], [], [], [], []],
      foundations: full,
    };
    expect(isWon(s)).toBe(true);
    expect(isWon(dealDeck(makeDeck(), 1))).toBe(false);
  });
});

describe("SolitaireEngine auto-complete", () => {
  it("is available only when stock is empty and no tableau card is face-down", () => {
    const ready: SolitaireStateForTest = {
      ...dealDeck(makeDeck(), 1),
      stock: [],
      waste: [],
      tableau: [
        [{ suit: "S", rank: 1, faceUp: true }],
        [], [], [], [], [], [],
      ],
      foundations: [[], [], [], []],
    };
    expect(canAutoComplete(ready)).toBe(true);

    const faceDown = { ...ready, tableau: [[{ suit: "S" as const, rank: 1, faceUp: false }], [], [], [], [], [], []] };
    expect(canAutoComplete(faceDown)).toBe(false);

    const withStock = { ...ready, stock: [{ suit: "S" as const, rank: 2, faceUp: false }] };
    expect(canAutoComplete(withStock)).toBe(false);
  });

  it("autoComplete flushes everything to the foundations and wins", () => {
    // Build a state one move from done: foundations hold A..Q of every suit,
    // each pile's King sits face-up on a tableau column.
    const foundations = ["S", "H", "D", "C"].map((suit) =>
      Array.from({ length: 12 }, (_, i) => ({ suit: suit as Suit, rank: i + 1, faceUp: true })),
    );
    const tableau: SolitaireStateForTest["tableau"] = [
      [{ suit: "S", rank: 13, faceUp: true }],
      [{ suit: "H", rank: 13, faceUp: true }],
      [{ suit: "D", rank: 13, faceUp: true }],
      [{ suit: "C", rank: 13, faceUp: true }],
      [], [], [],
    ];
    const s: SolitaireStateForTest = {
      ...dealDeck(makeDeck(), 1), stock: [], waste: [], foundations, tableau,
    };
    const done = autoComplete(s);
    expect(isWon(done)).toBe(true);
  });
});
