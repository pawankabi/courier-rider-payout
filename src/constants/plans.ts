export interface SubscriptionPlanItem {
  id: 'plan_test_1day' | 'starter' | 'growth' | 'enterprise' | string;
  name: string;
  displayName: string;
  nameHindi: string;
  price: number;
  amountInPaise: number;
  durationDays: number;
  durationLabel: string;
  description: string;
  tagline: string;
  features: string[];
  isTrial?: boolean;
  popular?: boolean;
  badge?: string;
  originalPrice?: number;
  savings?: number;
}

export const TEST_TRIAL_PLAN: SubscriptionPlanItem = {
  id: 'plan_test_1day',
  name: '1-Day Test Pass',
  displayName: '₹1 Test Pass',
  nameHindi: '₹1 टेस्ट पास (1 दिन ट्रायल)',
  price: 1,
  amountInPaise: 100, // 100 paise = ₹1.00
  durationDays: 1,
  durationLabel: '1 Day Pass (24 Hours)',
  description: '₹1 for 1 Day Trial / Testing Pass',
  tagline: 'Instant 24-Hour Pro Trial • Live Payment & Auto-Activation Test',
  features: [
    'Full Pro Access for 24 Hours',
    'Instant Auto-Activation',
    'Test Live Payment Integration',
  ],
  isTrial: true,
  badge: 'Testing / 1-Day Trial',
  originalPrice: 19,
};
