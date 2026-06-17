export type Suit = "S" | "H" | "D" | "C";
export type DrawMode = 1 | 3;
export type Card = { suit: Suit; rank: number; faceUp: boolean }; // rank 1..13

export type SolitaireState = {
  stock: Card[];
  waste: Card[];
  foundations: Card[][]; // 4 piles, build A..K by suit
  tableau: Card[][]; // 7 piles, build down alternating colour
  drawMode: DrawMode;
  moveCount: number;
  won: boolean;
};

const SUITS: Suit[] = ["S", "H", "D", "C"];

export function isRed(suit: Suit): boolean {
  return suit === "H" || suit === "D";
}

export function makeDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (let rank = 1; rank <= 13; rank++) deck.push({ suit, rank, faceUp: false });
  }
  return deck;
}

function shuffle(deck: Card[], rng: () => number): Card[] {
  const out = deck.map((c) => ({ ...c }));
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Deterministic deal from an already-ordered deck (top of deck dealt first). */
export function dealDeck(deck: Card[], drawMode: DrawMode): SolitaireState {
  const cards = deck.map((c) => ({ ...c, faceUp: false }));
  const tableau: Card[][] = [[], [], [], [], [], [], []];
  let idx = 0;
  for (let col = 0; col < 7; col++) {
    for (let row = 0; row <= col; row++) {
      const card = cards[idx++];
      card.faceUp = row === col; // top card face-up
      tableau[col].push(card);
    }
  }
  const stock = cards.slice(idx); // remain face-down
  return {
    stock,
    waste: [],
    foundations: [[], [], [], []],
    tableau,
    drawMode,
    moveCount: 0,
    won: false,
  };
}

export function createGame(drawMode: DrawMode, rng: () => number = Math.random): SolitaireState {
  return dealDeck(shuffle(makeDeck(), rng), drawMode);
}

/** Deal `drawMode` cards stock->waste; if stock is empty, recycle the waste. */
export function draw(state: SolitaireState): SolitaireState {
  if (state.won) return state;
  if (state.stock.length === 0) {
    if (state.waste.length === 0) return state;
    const stock = [...state.waste].reverse().map((c) => ({ ...c, faceUp: false }));
    return { ...state, stock, waste: [], moveCount: state.moveCount + 1 };
  }
  const n = Math.min(state.drawMode, state.stock.length);
  const taken = state.stock.slice(state.stock.length - n).reverse();
  const stock = state.stock.slice(0, state.stock.length - n);
  const waste = [...state.waste, ...taken.map((c) => ({ ...c, faceUp: true }))];
  return { ...state, stock, waste, moveCount: state.moveCount + 1 };
}

export function canMoveToFoundation(card: Card, foundationPile: Card[]): boolean {
  if (foundationPile.length === 0) return card.rank === 1;
  const top = foundationPile[foundationPile.length - 1];
  return card.suit === top.suit && card.rank === top.rank + 1;
}

export function canStackOnTableau(card: Card, destTop: Card | null): boolean {
  if (destTop === null) return card.rank === 13;
  return isRed(card.suit) !== isRed(destTop.suit) && card.rank === destTop.rank - 1;
}

/** The face-up alternating-descending run starting at `index`, or null if the
 *  card is face-down or the cards below it don't form a valid movable run. */
export function selectableRun(
  state: SolitaireState,
  tableauIndex: number,
  index: number,
): Card[] | null {
  const pile = state.tableau[tableauIndex];
  const card = pile[index];
  if (!card || !card.faceUp) return null;
  const run = pile.slice(index);
  for (let i = 1; i < run.length; i++) {
    if (!canStackOnTableau(run[i], run[i - 1])) return null;
  }
  return run;
}

export type PileRef =
  | { kind: "tableau"; index: number }
  | { kind: "foundation"; index: number }
  | { kind: "waste" }
  | { kind: "stock" };

function clonePiles(piles: Card[][]): Card[][] {
  return piles.map((p) => p.map((c) => ({ ...c })));
}

/** The cards being moved, given a source pile + the card index within it. */
function movingCards(state: SolitaireState, from: PileRef, index: number): Card[] | null {
  if (from.kind === "waste") {
    const top = state.waste[state.waste.length - 1];
    return top ? [top] : null;
  }
  if (from.kind === "tableau") return selectableRun(state, from.index, index);
  return null; // foundation/stock are never move sources here
}

/** Apply a validated move. Returns the unchanged state if the move is illegal. */
export function moveCards(
  state: SolitaireState,
  from: PileRef,
  index: number,
  to: PileRef,
): SolitaireState {
  if (state.won) return state;
  const moving = movingCards(state, from, index);
  if (!moving || moving.length === 0) return state;

  if (to.kind === "foundation") {
    if (moving.length !== 1) return state;
    if (!canMoveToFoundation(moving[0], state.foundations[to.index])) return state;
  } else if (to.kind === "tableau") {
    const destPile = state.tableau[to.index];
    const destTop = destPile.length ? destPile[destPile.length - 1] : null;
    if (!canStackOnTableau(moving[0], destTop)) return state;
  } else {
    return state;
  }

  const next: SolitaireState = {
    ...state,
    waste: [...state.waste],
    foundations: clonePiles(state.foundations),
    tableau: clonePiles(state.tableau),
    moveCount: state.moveCount + 1,
  };

  // Remove from source.
  if (from.kind === "waste") {
    next.waste.pop();
  } else if (from.kind === "tableau") {
    const src = next.tableau[from.index];
    src.splice(index, moving.length);
    const exposed = src[src.length - 1];
    if (exposed) exposed.faceUp = true; // flip the newly revealed card
  }

  // Add to destination.
  const placed = moving.map((c) => ({ ...c, faceUp: true }));
  if (to.kind === "foundation") next.foundations[to.index].push(...placed);
  else if (to.kind === "tableau") next.tableau[to.index].push(...placed);

  next.won = isWonInternal(next);
  return next;
}

function isWonInternal(state: SolitaireState): boolean {
  return state.foundations.reduce((n, p) => n + p.length, 0) === 52;
}

export function isWon(state: SolitaireState): boolean {
  return isWonInternal(state);
}

/** Move the addressed card to whatever foundation accepts it (double-click). */
export function sendToFoundation(
  state: SolitaireState,
  from: PileRef,
  index: number,
): SolitaireState {
  const moving = movingCards(state, from, index);
  if (!moving || moving.length !== 1) return state;
  for (let f = 0; f < 4; f++) {
    if (canMoveToFoundation(moving[0], state.foundations[f])) {
      return moveCards(state, from, index, { kind: "foundation", index: f });
    }
  }
  return state;
}

/** True when the game can finish itself: stock empty and every tableau card up.
 *  (Waste cards are always face-up, so they don't block auto-complete.) */
export function canAutoComplete(state: SolitaireState): boolean {
  if (state.won) return false;
  if (state.stock.length > 0) return false;
  return state.tableau.every((pile) => pile.every((c) => c.faceUp));
}

/** Repeatedly send the lowest available waste/tableau top card to a foundation
 *  until nothing else can move. */
export function autoComplete(state: SolitaireState): SolitaireState {
  let s = state;
  let progressed = true;
  while (progressed && !isWonInternal(s)) {
    progressed = false;
    // Waste top.
    if (s.waste.length) {
      const next = sendToFoundation(s, { kind: "waste" }, s.waste.length - 1);
      if (next !== s) { s = next; progressed = true; continue; }
    }
    // Each tableau top.
    for (let t = 0; t < 7; t++) {
      const pile = s.tableau[t];
      if (!pile.length) continue;
      const next = sendToFoundation(s, { kind: "tableau", index: t }, pile.length - 1);
      if (next !== s) { s = next; progressed = true; break; }
    }
  }
  return s;
}
