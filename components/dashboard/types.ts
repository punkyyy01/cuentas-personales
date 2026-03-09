export interface Account {
  id: number;
  user_id: string;
  name: string;
  type: string;
  balance: number;
  created_at: string;
}

export interface Transaction {
  id: string;
  user_id: string;
  account_id: number;
  amount: number;
  type: 'expense' | 'income';
  description: string;
  category: string;
  source: string;
  commerce?: string | null;
  merchant?: string | null;
  store_name?: string | null;
  transaction_date?: string | null;
  created_at: string;
}

export interface Budget {
  id: string;
  user_id: string;
  category: string;
  amount_limit: number;
  month: string;
  created_at: string;
  updated_at: string;
}

export interface CategoryBreakdown {
  category: string;
  total: number;
}
