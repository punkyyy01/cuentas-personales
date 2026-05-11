import type { Transaction, TransactionType, Category, Tag } from '@/lib/db/schema';

export interface QueryContext {
  categoriesById: Record<string, Category>;
  tagsById: Record<string, Tag>;
}

export interface ParsedQuery {
  textTerms: string[];
  categoryTerms: string[]; // category name or id
  tagTerms: string[];      // tag name or id
  type: TransactionType | null;
  amountMin: number | null;
  amountMax: number | null;
  recurringOnly: boolean;
}

function splitTerms(input: string): string[] {
  // Supports quoted strings: "foo bar"
  const out: string[] = [];
  const re = /"([^"]*)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input)) !== null) {
    const v = (m[1] ?? m[2] ?? '').trim();
    if (v) out.push(v);
  }
  return out;
}

function parseNumber(raw: string): number | null {
  const n = parseInt(raw.replace(/[^0-9-]/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}

export function parseQuery(input: string): ParsedQuery {
  const tokens = splitTerms(input.trim());

  const q: ParsedQuery = {
    textTerms: [],
    categoryTerms: [],
    tagTerms: [],
    type: null,
    amountMin: null,
    amountMax: null,
    recurringOnly: false,
  };

  for (const t of tokens) {
    const lower = t.toLowerCase();

    // @categoria:comida / @cat:comida
    if (lower.startsWith('@categoria:') || lower.startsWith('@cat:')) {
      const term = t.split(':').slice(1).join(':').trim();
      if (term) q.categoryTerms.push(term);
      continue;
    }

    // #tag or #tag:algo
    if (t.startsWith('#')) {
      const term = t.slice(1).replace(/^tag:/i, '').trim();
      if (term) q.tagTerms.push(term);
      continue;
    }

    // tipo:ingreso|gasto|transfer
    if (lower.startsWith('tipo:') || lower.startsWith('@tipo:')) {
      const v = t.split(':').slice(1).join(':').trim().toLowerCase();
      const type: TransactionType | null =
        v === 'ingreso' || v === 'income' ? 'income' :
        v === 'gasto' || v === 'expense' ? 'expense' :
        v === 'traspaso' || v === 'transfer' ? 'transfer' : null;
      if (type) q.type = type;
      continue;
    }

    // is:recurring
    if (lower === 'is:recurring' || lower === 'is:recurrente') {
      q.recurringOnly = true;
      continue;
    }

    // monto>10000 monto>=10000 monto<...
    const amountMatch = /^(monto|amount)(<=|>=|<|>)(.+)$/i.exec(t);
    if (amountMatch) {
      const op = amountMatch[2];
      const num = parseNumber(amountMatch[3]);
      if (num !== null) {
        if (op === '>' || op === '>=') q.amountMin = op === '>' ? num + 1 : num;
        else q.amountMax = op === '<' ? num - 1 : num;
      }
      continue;
    }

    // Free text
    q.textTerms.push(t);
  }

  return q;
}

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}+/gu, '')
    .toLowerCase();
}

function categoryMatches(term: string, tx: Transaction, ctx: QueryContext): boolean {
  const normTerm = normalize(term);
  if (tx.categoryId && normalize(tx.categoryId) === normTerm) return true;
  if (tx.categoryId) {
    const cat = ctx.categoriesById[tx.categoryId];
    if (cat && normalize(cat.name) === normTerm) return true;
  }
  // Splits: match any split category
  if (tx.splits) {
    for (const s of tx.splits) {
      if (normalize(s.categoryId) === normTerm) return true;
      const cat = ctx.categoriesById[s.categoryId];
      if (cat && normalize(cat.name) === normTerm) return true;
    }
  }
  return false;
}

function tagMatches(term: string, tx: Transaction, ctx: QueryContext): boolean {
  const normTerm = normalize(term);
  for (const id of tx.tags) {
    if (normalize(id) === normTerm) return true;
    const tag = ctx.tagsById[id];
    if (tag && normalize(tag.name) === normTerm) return true;
  }
  return false;
}

export function matchesQuery(tx: Transaction, parsed: ParsedQuery, ctx: QueryContext): boolean {
  if (parsed.type && tx.type !== parsed.type) return false;
  if (parsed.recurringOnly && !tx.isRecurring) return false;
  if (parsed.amountMin !== null && tx.amount < parsed.amountMin) return false;
  if (parsed.amountMax !== null && tx.amount > parsed.amountMax) return false;

  for (const term of parsed.categoryTerms) {
    if (!categoryMatches(term, tx, ctx)) return false;
  }

  for (const term of parsed.tagTerms) {
    if (!tagMatches(term, tx, ctx)) return false;
  }

  if (parsed.textTerms.length > 0) {
    const hay = normalize(`${tx.description} ${tx.notes}`);
    for (const term of parsed.textTerms) {
      if (!hay.includes(normalize(term))) return false;
    }
  }

  return true;
}

export function filterTransactions(txs: Transaction[], query: string, ctx: QueryContext): Transaction[] {
  const trimmed = query.trim();
  if (!trimmed) return txs;
  const parsed = parseQuery(trimmed);
  return txs.filter(tx => matchesQuery(tx, parsed, ctx));
}
