# 设计原则

这份文档沉淀 Nomi / 知己 相对稳定的产品设计原则。具体功能规格见 `docs/product-specs/`，前端工程约定见 `docs/FRONTEND.md`。

## Design Direction

Nomi should feel like a niche, carefully crafted iOS app: quiet, personal, focused, and intentionally small. The product follows a "less is more" design philosophy, where every screen exists to help the user capture, review, or ask about their own records with minimal effort.

The app should not feel like a dashboard, medical system, enterprise tool, or generic calorie tracker. It should feel like a private personal log with intelligence built in.

## Principles

- Clarity over density: show only what matters now.
- Calm over urgency: avoid alerts, warnings, aggressive colors, and judgmental language.
- Native over custom: prefer familiar iOS patterns, system typography, standard navigation, sheets, segmented controls, lists, and subtle haptics.
- Content over chrome: records, photos, numbers, and AI answers should be the focus; UI decoration should stay quiet.
- Fast capture over completeness: recording should take seconds, and details can be corrected later.
- Personal memory over analytics dashboard: trends should feel like gentle reflection, not performance scoring.
- Trust through restraint: AI answers should be grounded, sourced, and modest, not overconfident.

## Visual Style

- Use generous whitespace.
- Use a small, warm, neutral color palette with one restrained accent color.
- Avoid gradients, heavy shadows, flashy cards, gamification, badges, streak pressure, and red/yellow warning systems.
- Use large readable typography where it helps reflection, but keep operational screens compact and scannable.
- Prefer native iOS components unless a custom component clearly improves the experience.
- Animations should be subtle, tactile, and purposeful.

## UX Style

- Home should answer: "What did I record today?" and "What can I add quickly?"
- Capture should be the primary action.
- Editing AI-extracted data should feel lightweight and forgiving.
- Ask should feel like talking to a quiet personal assistant, not a chatbot gimmick.
- Trends should reveal patterns without making the user feel judged.
- Empty states should invite one small action, not explain the whole product.

## Do Not Build

- A medical dashboard.
- A productivity CRM for health.
- A social or gamified health app.
- A dense quantified-self cockpit.
- A loud AI-first interface where chat dominates everything.
