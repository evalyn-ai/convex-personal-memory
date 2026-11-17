/** Synthetic analytics-assistant chats. Every company, person, product and
 * metric is fictional. `turns` are the user's messages in order; `keep` and
 * `avoid` say, in plain words, what the final memory list must and must not
 * hold. */
export type Case = {
  id: string;
  turns: string[];
  keep: string[];
  avoid: string[];
};

export const cases: Case[] = [
  {
    id: 'pref-exceptions-first',
    turns: [
      "Morning! Can you pull last week's order count for the Northwind Outfitters stores?",
      'Thanks. Why does the Elm Street store show zero on Thursday?',
      'Ugh, long weekend. Ok, the regional summary you sent was fine but I had to scroll to find the problems. For any report you build me, always lead with the exceptions, the stores or metrics that are off target, and only then the overall numbers.',
      'Can you also check whether the returns rate includes exchanges?',
      "Quick one: what's the timezone on the dashboard timestamps?",
      'OK, leave it as is, thanks.',
    ],
    keep: [
      'Reports lead with the exceptions (off-target stores or metrics) before overall numbers.',
    ],
    avoid: ['Anything about dashboard timezones or UTC.'],
  },
  {
    id: 'pref-one-decimal',
    turns: [
      'Hey, can you break down signups by acquisition channel for September?',
      'Organic looks low. Is the UTM tagging broken again?',
      'One thing that bugs me: percentages rounded to whole numbers hide too much. Please always show percentages with one decimal place, like 12.4%.',
      'Can you redo the channel split from last week that way?',
      'Do we have the refund data in the warehouse yet?',
      'Ok ping me when it lands. Have a good weekend!',
    ],
    keep: ['Percentages are shown with one decimal place.'],
    avoid: ['Anything about UTM parameters.'],
  },
  {
    id: 'pref-tables-over-charts',
    turns: [
      'Can you show me support ticket volume by priority for July?',
      "Hmm. Honestly I prefer tables over charts, I end up copying everything into a spreadsheet anyway. Default to tables for me, please. What's the median first-response time?",
      'lol the coffee machine is broken again, this week is cursed',
      'Anyway, can you check whether the Zephyr queue has tickets older than 30 days?',
    ],
    keep: ['Prefers tables over charts.'],
    avoid: ['Small talk about coffee.'],
  },
  {
    id: 'scope-weekly-vs-board',
    turns: [
      'Can you draft the weekly ops review for Cobalt Logistics? Late shipments, warehouse utilisation, driver overtime.',
      'Way too long. For the weekly ops reviews, keep it to five bullets max, people skim it on their phones. The monthly board pack is different though, that one can be as detailed as it needs to be, with appendix tables.',
      'What was the late shipment rate in the Denver hub last week?',
      'Thanks. Can you add the Reno hub to the warehouse dashboard?',
      'Is the fuel cost table updated daily or weekly?',
    ],
    keep: ['At most five bullets, scoped to weekly (ops) reviews.'],
    avoid: ['A five-bullet limit that applies generally or to the board pack.'],
  },
  {
    id: 'scope-project-currency',
    turns: [
      "I'm running two client projects now, Halcyon and Juniper. Can you set up a vendor spend view for each?",
      'For the Halcyon project, report all amounts in EUR, their finance team is in Lyon. Everything else stays in USD.',
      'How many vendors do we have on Juniper?',
      'OK. Can you add a column for payment terms?',
      "Totally unrelated, which of these dashboard names sounds better: 'Spend Radar' or 'Vendor Pulse'?",
    ],
    keep: ['Amounts in EUR, scoped to the Halcyon project.'],
    avoid: ['EUR as a general currency preference, or for Juniper.'],
  },
  {
    id: 'scope-audience',
    turns: [
      'I need to explain the trial-to-paid dip to the leadership team on Friday.',
      "When I'm preparing something for the exec team, no jargon and no SQL, plain language and one chart at most. When it's just me exploring, show me the queries you ran.",
      'Can you check if the trial length changed in July?',
      'Interesting, thanks',
    ],
    keep: [
      'No SQL or technical jargon, scoped to the executive or leadership audience.',
      'Show the SQL or queries when the user is exploring on their own.',
    ],
    avoid: ['A general rule to never show SQL.'],
  },
  {
    id: 'scope-retention-heatmap',
    turns: [
      'Can you pull 30-day retention for the Q1 signups?',
      'For anything about retention, please show it as a cohort heatmap. The line charts never show me which cohorts are weak.',
      "What's the biggest customer by seats on the Pro plan?",
      'Cool, and do they have SSO enabled?',
      "Can you rename the 'Growth' dashboard to 'Acquisition'?",
    ],
    keep: ['Cohort heatmap, scoped to retention analysis.'],
    avoid: ['Heatmaps as a general chart preference.'],
  },
  {
    id: 'update-summary-dropped',
    turns: [
      'Can you set up an inventory turnover report for the Brightleaf warehouses?',
      'Nice. I like having a short summary paragraph at the top of reports, keep doing that.',
      'Which SKUs have zero movement in 90 days?',
      'Thanks, send that to me as a CSV please.',
      "I've changed my mind about the summary paragraph at the top, nobody reads it. Drop it and just start reports with the main table.",
      'Also, is the Fresno warehouse included in turnover?',
    ],
    keep: ['Reports start with the main table.'],
    avoid: ['Reports start with a summary paragraph.'],
  },
  {
    id: 'update-region-to-division',
    turns: [
      'Can you build the pipeline report for Tessellate Software? Break the pipeline down by region.',
      "Actually, not by region, by division. Regions don't matter for how we manage sales, so always split pipeline by division.",
      "What's the average deal cycle in days?",
      'And how many deals slipped from Q2?',
    ],
    keep: ['Pipeline broken down by division.'],
    avoid: ['Pipeline broken down by region.'],
  },
  {
    id: 'update-date-format',
    turns: [
      'Please use US dates, MM/DD/YYYY, in everything you send me.',
      'Can you list the campaigns that launched in May?',
      'How many email bounces last week?',
      'That seems high, can you split by domain?',
      'Heads up: our whole team is moving to ISO dates. From now on please use YYYY-MM-DD in everything.',
      'Thanks. Also is the bounce spike fixed?',
    ],
    keep: ['Dates in YYYY-MM-DD (ISO) format.'],
    avoid: ['Dates in MM/DD/YYYY format.'],
  },
  {
    id: 'update-remove-footnote',
    turns: [
      'For every report, add a short methodology footnote at the bottom: data sources and filters.',
      'Can you pull the NPS responses for July?',
      "Who owns the 'Partner Revenue' dashboard?",
      'You can stop adding the methodology footnote. Nobody reads it and it clutters the PDFs.',
      'Can you resend the NPS report without it?',
    ],
    keep: [],
    avoid: ['Include a methodology footnote.'],
  },
  {
    id: 'oneoff-pie-chart',
    turns: [
      "I generally prefer bar charts, they're easier to compare.",
      'Can you show weekly active users for July?',
      'Just for this one, use a pie chart for revenue share by product line, it is for a slide where Dana wants a pie.',
      'Thanks, perfect.',
      'Did the August invoice data load?',
    ],
    keep: ['Prefers bar charts.'],
    avoid: ['Use a pie chart (it was a one-off request).'],
  },
  {
    id: 'oneoff-request-header',
    turns: [
      'Can you pull the top 20 customers by order value for September?',
      "For this request:\n- sort ascending by order value\n- include cancelled orders\n- show customer IDs instead of names\nI need it to reconcile with finance's export.",
      'Great, that matches their file.',
      'What time does the nightly sync run?',
    ],
    keep: [],
    avoid: [
      'Sort ascending.',
      'Include cancelled orders.',
      'Show customer IDs instead of names.',
    ],
  },
  {
    id: 'oneoff-today-rush',
    turns: [
      "Today I'm slammed, just give me the headline number for each answer, no breakdowns.",
      'What was the marketing-qualified lead count for August?',
      'Can you set up a campaign spend tracker for the Q4 launches?',
      'Nice!',
    ],
    keep: [],
    avoid: ['Give only a headline number (it was just for today).'],
  },
  {
    id: 'nolearn-metrics',
    turns: [
      'For context, revenue last quarter was 4.2M and churn was 3.1%. Finance just confirmed it.',
      'Can you set up a monthly revenue dashboard for Pinecrest Health?',
      'Our NPS came in at 41 this month, which is a record.',
      'Can you add an NPS tile to the dashboard?',
    ],
    keep: [],
    avoid: [
      'A revenue figure such as 4.2M.',
      'A churn figure such as 3.1%.',
      'An NPS figure such as 41.',
    ],
  },
  {
    id: 'nolearn-colleague-opinion',
    turns: [
      "Priya on the finance team thinks we should always show medians instead of means for order values. I'm not convinced yet.",
      'Anyway, can you pull average basket size by store for September?',
      "Marco says weekly cohort charts are useless. He might be right, I don't know.",
      "What's the repeat purchase rate for Q3?",
    ],
    keep: [],
    avoid: [
      "Priya's view about medians, stored as the user's preference.",
      "Marco's view about cohorts, stored as the user's preference.",
    ],
  },
  {
    id: 'nolearn-assistant-suggestion',
    turns: [
      'Can you compare conversion for the two checkout variants?',
      "Hmm, not now. Let's see how it goes.",
      "What's the sample size per variant so far?",
      'Ok, let me know when it hits 10k each.',
    ],
    keep: [],
    avoid: [
      'Always include confidence intervals or significance tests (the assistant suggested it; the user declined).',
      'A sample-size figure such as 10k.',
    ],
  },
  {
    id: 'nolearn-pasted-guideline',
    turns: [
      'Can you check this against our dashboards? Pasted from Acme Corp\'s brand guide: "All charts must use the corporate teal palette and never show more than four series." Do any of ours break that?',
      "Ok, that's their rule for their decks, not ours. Thanks.",
      'How many dashboards were viewed last week?',
    ],
    keep: [],
    avoid: [
      'A teal colour palette (from pasted third-party rules).',
      'A limit of four series (from pasted third-party rules).',
    ],
  },
  {
    id: 'decision-test-accounts',
    turns: [
      'We had a long debate in the metrics review and decided: exclude test accounts from all churn numbers, starting now.',
      'Can you pull the list of test accounts so I can double check?',
      "What's the colour code of the dashboard header?",
      'thx',
    ],
    keep: ['Exclude test accounts from churn.'],
    avoid: ['A header colour such as #1F3A5F.'],
  },
  {
    id: 'decision-priority-onboarding',
    turns: [
      'Planning season. My priority this quarter is onboarding conversion, everything else is secondary.',
      'Can you show me the onboarding funnel for September?',
      "How many support tickets mention 'billing'?",
      'OK thanks',
    ],
    keep: ['Onboarding conversion is the top priority.'],
    avoid: ['Anything about a billing question.'],
  },
  {
    id: 'decision-drop-nps-widget',
    turns: [
      'Can you outline the weekly customer deck for Larkspur Foods?',
      "We decided in today's sync to stop reporting the NPS widget in the weekly customer deck, the sample is too small week to week.",
      "What's CSAT for last week?",
      'Thanks',
    ],
    keep: ['Leave NPS out of the weekly deck.'],
    avoid: ['A CSAT figure such as 4.4.'],
  },
  {
    id: 'abstain-funnel-style',
    turns: [
      'I prefer dark mode dashboards.',
      'What was the cart abandonment rate last week?',
      'Use our brand blue for the main series in charts.',
      'Can you make the KPI tiles a bit smaller?',
    ],
    keep: ['Prefers dark mode.', 'Uses brand blue.'],
    avoid: ['Any funnel chart preference.'],
  },
  {
    id: 'abstain-apac-currency',
    turns: [
      'For EMEA reports, use GBP.',
      'How many active accounts do we have in EMEA?',
      'Can you add a country filter to the EMEA dashboard?',
    ],
    keep: ['GBP, scoped to EMEA.'],
    avoid: ['Any APAC currency preference.'],
  },
  {
    id: 'many-preferences',
    turns: [
      "Hi! I'm the new analytics lead at Ardent Bikes. Can you show me sales by bike model for May?",
      'Lead with the answer, then the supporting detail. I hate scrolling to find the point.',
      'Also use thousands separators in numbers, and round currency to whole dollars.',
      'And sort tables by the largest value first.',
      'How many dealers do we have in the Midwest?',
      'No 3D charts, ever. They distort everything.',
      'Put the date range in the title of every chart.',
      'Use red only for problems, never for a normal series.',
      "For the Retail team's dashboards, label things in plain words, not metric codes like RT_GMV_7D.",
      'Weather is gorgeous today, I might bike home.',
      'I like small multiples instead of one cluttered chart.',
      'Keep emails to me under 150 words.',
      "When you're unsure about data quality, say so up front.",
      'Show dealer names, not dealer IDs.',
      'For weekly reviews, end with a one-line takeaway.',
      'What was the warranty claim count in May?',
      'For the board pack, use a landscape layout.',
      'My priority this half is reducing warranty claim costs.',
      'Highlight anything that moved more than 10% week over week.',
      'Can you check if the June dealer file arrived?',
    ],
    keep: [
      'Lead with the answer or conclusion.',
      'Use thousands separators.',
      'Round currency to whole dollars.',
      'Sort largest first.',
      'No 3D charts.',
      'Put the date range in chart titles.',
      'Use red for problems.',
      'Plain labels instead of metric codes, scoped to the Retail audience.',
      'Prefer small multiples.',
      'Keep emails under 150 words.',
      'Flag data-quality concerns or uncertainty.',
      'Show dealer names rather than IDs.',
      'End with a one-line takeaway, scoped to weekly reviews.',
      'Landscape layout, scoped to the board pack.',
      'Warranty cost is a priority.',
      'Highlight metrics that moved more than 10%.',
    ],
    avoid: [
      'Small talk about the weather or biking home.',
      'A warranty claim count such as 412.',
    ],
  },
  {
    id: 'combined-weekly-stack',
    turns: [
      'Can you show conversion by store for Larkfield Home last week?',
      'Please always use store names, not the LH codes. Nobody here knows the codes.',
      'And percentages to one decimal place in everything you give me, two decimals is noise.',
      'Which store had the lowest basket size?',
      'For my weekly store reports, end with a short list of actions for the regional managers. Not needed for quick questions.',
    ],
    keep: [
      'Refer to stores by name, not code.',
      'Percentages with one decimal place.',
      'End with actions for regional managers, scoped to weekly reports.',
    ],
    avoid: ['A basket-size figure such as $41 or a Brookside fact.'],
  },
  {
    id: 'combined-two-calendars',
    turns: [
      'For anything I prepare for the finance team, use our fiscal calendar, the fiscal year starts on February 1.',
      'Marketing dashboards stay on normal calendar months though.',
      'Also, always include a prior-year comparison column. I always get asked for it.',
    ],
    keep: [
      'Fiscal calendar (year starts February 1), scoped to finance.',
      'Calendar months, scoped to marketing.',
      'Include a prior-year comparison.',
    ],
    avoid: [],
  },
  {
    id: 'combined-update-among-others',
    turns: [
      'For churn analyses, show me a line chart of monthly churn.',
      'Always split churn by plan tier, Starter, Team and Enterprise.',
      'And put the methodology in a footnote, not in the main text.',
      'Actually, the churn line charts are hard to read with three tiers. Use a table for churn instead from now on.',
    ],
    keep: [
      'Show churn as a table.',
      'Split churn by plan tier.',
      'Put the methodology in a footnote.',
    ],
    avoid: ['Show churn as a line chart.'],
  },
  {
    id: 'combined-threshold-and-order',
    turns: [
      'When you report metrics to me, highlight anything that moved more than 15% week over week. Smaller moves are noise.',
      'Lead with the answer, then the details.',
      'For the weekly review I still want a one-line takeaway at the very end. So answer at the top, takeaway at the bottom.',
    ],
    keep: [
      'Highlight metrics that moved more than 15%.',
      'Lead with the answer or conclusion.',
      'End with a one-line takeaway, scoped to the weekly review.',
    ],
    avoid: [],
  },
  {
    id: 'combined-colleague-and-own',
    turns: [
      'Priya on my team loves pie charts for plan mix. I want bar charts for that though.',
      "Marco suggested excluding internal test accounts from retention numbers. Let's do that for every retention metric you give me.",
      'Dana thinks we should report retention monthly, not weekly. Not sure yet, I will think about it.',
      'Please label every chart axis with units.',
    ],
    keep: [
      'Bar charts for plan mix.',
      'Exclude test accounts.',
      'Label axes with units.',
    ],
    avoid: [
      "Pie charts (Priya's preference, which the user rejected).",
      'Report retention monthly, stated as decided (Dana only suggested it).',
    ],
  },
];
