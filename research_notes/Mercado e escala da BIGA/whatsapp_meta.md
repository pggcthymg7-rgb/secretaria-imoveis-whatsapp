# WhatsApp/Meta: platform risk, official API limits and Brazil pricing (as of Nov 2026)

Scope: Brazilian SaaS for real-estate brokers that uses Baileys (an unofficial client on the WhatsApp Web protocol) to READ group messages and send automated DMs. Research date: 2026-11-11. Most "anti-ban" material is unofficial or from vendors and is labeled that way.

## (a) Risk of unofficial APIs: ToS, enforcement, legal actions

### Takeaway
Using Baileys against a consumer or Business-app number breaks the WhatsApp Terms on several counts: automated access, bulk/auto-messaging, reverse engineering, collecting user data, and use of unofficial clients. WhatsApp enforces mainly through machine-learning bans of about 2M accounts a month worldwide. Since Dec 2019 it has formally reserved the right to sue anyone "engaged in or assisting" bulk or automated abuse, including on evidence found only off-platform. A vendor that publicly sells this capability is therefore exposed as well, not just its users. I found no public lawsuit against a Baileys-type API vendor.

### Cited Findings
- The WhatsApp Terms of Service bar using, accessing or copying the Services "through automated or other means" in unauthorized ways, and bar creating accounts "through unauthorized or automated means" — [WhatsApp Terms of Service](https://www.whatsapp.com/legal/terms-of-service)
- The Terms list "bulk messaging, auto-messaging, auto-dialing, and the like" as impermissible communications — [WhatsApp ToS](https://www.whatsapp.com/legal/terms-of-service)
- The Terms forbid users to "reverse engineer, alter, modify, create derivative works from, decompile, or extract code from our Services", to "collect information of or about our users in any impermissible or unauthorized manner", and to "create software or APIs that function substantially the same as our Services" for third parties without authorization — [WhatsApp ToS](https://www.whatsapp.com/legal/terms-of-service)
- On sanctions, the Terms say WhatsApp "may take action with respect to your account, including disabling or suspending your account" and may "terminate your access … anytime for any reason" — [WhatsApp ToS](https://www.whatsapp.com/legal/terms-of-service)
- The WhatsApp Help Center defines unofficial apps as "versions of WhatsApp developed by third parties without WhatsApp's approval". It says "linking your WhatsApp account to unofficial versions of WhatsApp violates our Terms of Service" and that this can lead to temporary or permanent bans and limits on linking devices. Its named examples are GB/FM/TM WhatsApp and TeleMessage. Baileys is not named, but it connects as a linked device on the Web protocol — [WhatsApp FAQ – unofficial apps](https://faq.whatsapp.com/1217634902127718)
- WhatsApp's position on automation: "Our products are not intended for bulk or automated messaging". It relies on ML classifiers and admits that "some companies attempt to evade our machine learning systems". It says it will use "legal action" against those engaged in or assisting abuse from Dec 7, 2019, including where its evidence is "solely available to us off our platform" — [WhatsApp FAQ – Unauthorized use of automated or bulk messaging](https://faq.whatsapp.com/5957850900902049)
- The press read the 2019 policy as covering companies' public claims that they can use WhatsApp in breach of its terms (for example, marketing copy). WhatsApp also sent cease-and-desist letters to Indian bulk-messaging tool vendors — [TNW](https://thenextweb.com/news/whatsapp-will-sue-businesses-for-abusing-bulk-messaging); [Arab News](https://www.arabnews.pk/node/1509751)
- Scale of enforcement: WhatsApp bans about 2M accounts a month worldwide for automated or bulk behaviour. About 75% are removed by ML without any user report. Detection runs at registration, during messaging, and on negative feedback — [Digit](https://www.digit.in/?p=80064); [Arab News](https://www.arabnews.pk/node/1509751)
- In India, where monthly disclosure is mandatory, bans were 9.97M in Jan 2025 and 9.7M in Feb 2025, all ToS reasons combined. An earlier 2024 report put more than 95% of bans down to unauthorized automated or bulk messaging — [Inc42](https://inc42.com/buzz/whatsapp-banned-99-6-lakh-accounts-in-january-2025/); [Business Today](https://www.businesstoday.in/technology/news/story/whatsapp-banned-97-million-indian-accounts-in-february-heres-why-470175-2025-04-01)
- In Oct 2025 Meta confirmed a test of a monthly cap on messages sent to people who never reply, covering both individuals and businesses. Messages are removed from the count if the recipient replies. The exact number was not disclosed — [Engadget](https://www.engadget.com/social-media/whatsapp-will-test-a-monthly-cap-on-messages-ignored-by-recipients-164024928.html)
- Related legal actions: Meta/WhatsApp sued the makers of "unofficial" WhatsApp apps (heymods.com, Rockey Tech HK) in 2022. That was a malware/account-takeover case, not an API one — [Docket Alarm](https://www.docketalarm.com/cases/California_Northern_District_Court/4--22-cv-05711/WhatsApp_LLC_et_al_v._Rockey_Tech_HK_Ltd._et_al/1/); [Law Street Media](https://lawstreetmedia.com/news/tech/meta-whatsapp-sue-chinese-companies-behind-summer-2022-whatsapp-takeover-attacks/). Meta has also sued scraping vendors over Facebook/Instagram (Octopus/Octoparse, Voyager Labs), citing ToS and DMCA — [TechCrunch](https://techcrunch.com/2022/07/06/meta-sues-chinese-companys-us-subsidiary-for-scraping-facebook-and-instagram-data)
- The Baileys README says it is not affiliated with WhatsApp and that its maintainers "do not in any way condone the use of this application in practices that violate the Terms of Service of WhatsApp" — [Baileys README (npm mirror)](https://cdn.jsdelivr.net/npm/whaileys@6.5.0/README.md); [socket.dev – @whiskeysockets/baileys](https://socket.dev/npm/package/@whiskeysockets/baileys)
- A WAHA issue (about its Baileys fork) says upstream updates are "very important … to prevent our clients from getting banned". It also says protocol details such as sending too many ACKs can lead to bans. In other words, ban risk depends on keeping up with the library — [GitHub devlikeapro/waha #1538](https://github.com/devlikeapro/waha/issues/1538)
- In 2026 WhatsApp admitted to wrongful suspensions of legitimate users by its automated moderation. This shows the risk of false-positive bans even without automation — [TechRepublic (Aug 2026)](https://www.techrepublic.com/article/news-whatsapp-account-wrongful-suspensions/)
- UNOFFICIAL/VENDOR claims, low reliability: "ban waves every 2–3 months" and "a Baileys number lives 2–8 weeks" — [kraya blog](https://kraya-blog-platform.vercel.app/whatsapp-automation-ban-risk); "Meta is actively banning … unofficial APIs (Baileys)", tighter from H2 2025 — [ChatDaddy help](https://help.chatdaddy.tech/article/ban-type-distribution). One Brazilian dev forum post says a Baileys ban is rare from connecting alone and usually follows spam (anecdotal) — [TabNews](https://www.tabnews.com.br/Papagaio/b0b29dd3-e045-4e20-a0fd-c0d7b89b2910)

### Inferences
- Two separate risks exist. (1) Operational: each broker's number can be banned, which for a broker means losing their contacts and client history. (2) Legal and commercial: Biga "assists" automation and its public marketing is evidence of that under the 2019 policy. Meta's history shows it sues vendors (scraping, unofficial apps), not end users.
- The product reads groups and collects data about other participants who never opted in. That fits the "collect information of or about our users in any impermissible manner" clause and creates LGPD exposure too (other agent's area).
- Automated DMs to cold contacts are the riskiest use case. They combine ML spam signals, user reports, and the unanswered-message cap (if it has been rolled out). Passive group reading is less visible, but still breaks the rules on automated access and data collection.

### Gaps
- I found no specific Meta lawsuit against a Baileys-based vendor or an unofficial WhatsApp API vendor, in Brazil or elsewhere, between 2024 and 2026.
- I found no primary data on documented ban waves specific to Baileys in 2024–2026. The Baileys GitHub issues I found about bans were deleted or unreadable (#2239 deleted; #1761 content unavailable).
- Status of the unanswered-message cap in Nov 2026 (rolled out? live in Brazil? what limit?) is not confirmed.
- I found no WhatsApp ban statistics for Brazil; only India publishes them.

## (b) Official Cloud API: constraints and Brazil pricing

### Takeaway
Since 1 Jul 2025 Meta charges per delivered message, by category and recipient country. From 1 Oct 2026 service messages are charged after the first 1,000 per number per month, at the utility rate. So is utility inside the 24h window. Brazil can now be billed in BRL (from Jul 2026). Third parties cite the Brazil rate card at R$0.3217 marketing and R$0.0350 utility, authentication and service. That is about US$0.0625 for marketing and US$0.0068 for utility and authentication. These come from aggregators and should be checked against Meta's official CSV.

### Cited Findings
- Per-message model since 1 Jul 2025. Only delivered messages are charged. User-to-business messages are free. Templates come in three categories: Marketing, Utility and Authentication. Non-template messages are Service and Meta Business Agent (added 1 Jul 2026) — [Meta – Pricing](https://developers.facebook.com/docs/whatsapp/pricing)
- Service window: 24h from the user's last message. Outside it, only templates can be sent, and only to users who have opted in — [Meta – Pricing](https://developers.facebook.com/docs/whatsapp/pricing)
- Free entry point: after a click-to-WhatsApp ad (Android/iOS), the reply opens a window of up to 7 days with no charge for templates or service. Meta Business Agent messages are still charged — [Meta – Pricing](https://developers.facebook.com/docs/whatsapp/pricing)
- 2026 change: from 1 Oct 2026 service messages are charged beyond a free tier of 1,000 per business number per month. The tier does not roll over. Service messages had been free since 1 Nov 2024. Utility messages sent inside an open window are also charged from 1 Oct 2026 (free since 1 Jul 2025) — [Meta – Pricing](https://developers.facebook.com/docs/whatsapp/pricing); [Meta – Non-template messages pricing updates](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/non-template-messages/)
- The service rate equals the market's utility/authentication rate. Service has no volume tiers; utility and authentication keep theirs. Rates can change quarterly. Without a payment method on file by 30 Sep 2026, service-message delivery stops from 1 Oct 2026 — [Meta – Non-template messages](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/non-template-messages/)
- Meta Business Agent (Meta's AI): from 1 Aug 2026, a single rate of US$2.00 per 1M tokens (input plus output). That is about 20–25k tokens per message, roughly US$0.04–0.05 per message. Meta's Brazil example: 1,000 AI-powered messages cost about US$27–97 as service messages (including "delivery at 0.68 cents per message") or about US$40–50 through the Business Agent — [Meta – Non-template messages](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/non-template-messages/)
- The "0.68 cents per message" delivery figure in Meta's own Brazil example confirms the utility/service rate is about US$0.0068 in Brazil — [Meta – Non-template messages](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/non-template-messages/)
- BRL: billing in reais started 1 Jul 2026 for eligible customers with a Brazil Sold-To country. Accounts not billed in BRL must migrate by 30 Jun 2027. Rate cards are published per currency (USD, BRL, …) as CSV/PDF — [Meta – Pricing](https://developers.facebook.com/docs/whatsapp/pricing)
- Oct 2026 rate card: 40 rates changed, and 9 markets left "Rest of" regional pricing. It is not clear whether Brazil changed — [Meta – Pricing](https://developers.facebook.com/docs/whatsapp/pricing)
- Brazil in BRL (secondary source, "effective October 1, 2026", attributed to the Meta rate card): Marketing R$0.3217; Utility R$0.0350; Authentication R$0.0350; Service R$0.0350 after 1,000 free per number per month. Utility/authentication get up to 25% volume discount, down to R$0.0263 — [ChatMaxima – Brazil](https://chatmaxima.com/whatsapp-api-pricing/brazil/)
- Brazil in USD (secondary sources): Marketing US$0.0625; Utility/Authentication US$0.0068 — [whautomate](https://whautomate.com/whatsapp-business-api-pricing-brazil); [hyperleap calculator](https://hyperleap.ai/whatsapp-pricing-calculator-brazil). Conflicts: SleekFlow lists marketing at US$0.07188 — [SleekFlow](https://help.sleekflow.io/en_US/pricing); Montymobile lists utility at about US$0.022 — [Montymobile](https://montymobile.com/newsroom/whatsapp-business-api-pricing-the-complete-2026-cost-guide-for-enterprise-teams/). I consider these outliers or outdated, because Meta's own example uses US$0.0068.

### Inferences
- Example unit costs per broker, as an estimate: 300 outbound utility templates a month cost about R$10.50. 300 marketing messages cost about R$96.51. The marketing case alone is the full price of the R$97 plan, which is incompatible with a gross margin above 75%. Cold outreach (marketing) through the official API is not economically viable on the R$97 plan. Utility messages and replies inside the window are.
- The 1,000 free service messages per month apply per number. If each broker uses their own number (embedded signup), most inbound conversations stay free. If one shared Biga number is used, the free tier is spread across everyone.
- Meta's AI (Business Agent) at US$0.04–0.05 per message is 6–7 times the delivery rate. Using your own LLM inside the service window is cheaper.

### Gaps
- I could not open Meta's official Brazil CSV/PDF (BRL and USD) to confirm R$0.3217 / R$0.0350 and US$0.0625 / US$0.0068 directly. The BRL figures are from ChatMaxima and the USD ones from aggregators. The US$0.0068 figure is indirectly confirmed by Meta's own example.
- I don't know whether Brazil's rates changed in the 1 Oct 2026 rate card.
- The USD/BRL exchange rate used by Meta is not documented for card billing in BRL.

## (c) Migration feasibility: the Groups API and reading groups

### Takeaway
The official Groups API cannot replace Baileys for the "Radar". It only works with groups the business itself creates through the API. Participants join by invite link, groups are capped at 8 members, and the account must hold an Official Business Account (blue badge). I found no documented way to join or read existing third-party groups, such as broker groups with hundreds of members. Migrating the group-reading feature is not feasible with the official API. Only the DM/notification part can move.

### Cited Findings
- Groups API: open to businesses with an Official Business Account (OBA). Not available for WhatsApp Business app numbers or numbers on Multi-solution Conversations — [Meta – Groups API](https://developers.facebook.com/documentation/business-messaging/whatsapp/groups/)
- Hard limits: up to 8 participants per group, 10,000 groups per number, and 1 Cloud API business per group — [Meta – Groups API](https://developers.facebook.com/documentation/business-messaging/whatsapp/groups/)
- Joining is invite-only through a link the business sends. Features: create/delete group, join requests, get/reset invite link, remove participants, group info, list active groups, settings, send and receive messages — [Meta – Groups API](https://developers.facebook.com/documentation/business-messaging/whatsapp/groups/)
- Not supported: calling, disappearing messages, view-once, authentication, commerce and interactive messages. Admins cannot hide participants or edit/delete messages. No template metrics in groups. Pricing is per message — [Meta – Groups API](https://developers.facebook.com/documentation/business-messaging/whatsapp/groups/)
- Kapso (BSP), citing Meta's docs of 21 May 2026: OBA requirement ("most businesses don't have it"). The only documented flow is a group the business creates and users join through the invite. Users are never added silently. Billing is per delivered participant, with a group service window. Kapso does not offer the Groups API on numbers it manages — [Kapso – State of the Groups API 2026](https://kapso.com/blog/whatsapp-groups-api-state-2026)
- Gupshup lists the Groups API as Beta and excludes Coexistence users (numbers that use the Business App and the API at the same time) — [Gupshup docs](https://docs.gupshup.io/docs/whatsapp-groups-api)
- The official AI policy (relevant to an AI-powered "Secretária"): from 15 Jan 2026 (new users from 15 Oct 2025) the Business Solution Terms ban "AI Providers" whose primary function is a general-purpose assistant (ChatGPT, Perplexity, Copilot). AI for support, sales, notifications and other business-specific uses is still allowed — [TechRadar](https://techradar.com/ai-platforms-assistants/meta-will-ban-rival-ai-chatbots-from-whatsapp); [9to5Mac](https://9to5mac.com/2025/10/20/whatsapp-bans-ai-chatbots-from-using-its-business-api/); [respond.io](https://respond.io/blog/whatsapp-general-purpose-chatbots-ban); [Business Standard](https://www.business-standard.com/technology/tech-news/meta-bans-ai-chatbots-from-whatsapp-business-api-chatgpt-to-shut-down-jan-2026-125102200335_1.html)

### Inferences
- A broker assistant for real estate (lead qualification, scheduling, sending listings) counts as business-specific AI and is allowed. A general "ask me anything" assistant is not.
- Possible hybrid architecture:
  - DMs/notifications go through the Cloud API: utility templates plus replies inside the window, with explicit opt-in.
  - Listing intake moves from "reading groups" to channels with consent. Options: (i) brokers forward listings to the Biga number, so a user message opens a free service window; (ii) official Biga groups of up to 8 members, only if OBA is obtained; (iii) a web form or link.
  - Reading third-party groups remains possible only through an unofficial client. That is a non-compliant risk and should be presented as such, or shut down.
- OBA (blue badge) depends on notability, which an early-stage startup is unlikely to have. That makes even option (ii) uncertain.
- UNOFFICIAL practical anti-ban practices (from community and vendor sources, no official numbers). These reduce the chance of a ban; they do not remove it:
  - read groups passively, without sending anything
  - warm up new numbers
  - add random delays and simulate "typing"
  - send only to contacts who have messaged first or saved the number
  - avoid links and identical text in bulk
  - keep Baileys up to date
  - use one session per number and stable IP/device
  - [WAHA #1538](https://github.com/devlikeapro/waha/issues/1538); [baileys-antiban README](https://cdn.jsdelivr.net/npm/baileys-antiban@4.10.0/README.md); [checkleaked dev guide](https://whatsapp.checkleaked.cc/blog/avoid-whatsapp-ban)

### Gaps
- Meta's documentation does not say outright that the API cannot read groups not created through it. The conclusion follows from the invite-only flow, "1 Cloud API business per group" and the 8-member limit, plus BSP readings (Kapso). Uncertainty: low to moderate.
- Groups API launch date and exact per-participant prices in Brazil: not found.
- Reliable message-per-day limits for unofficial automation: none exist. Figures in circulation (for example "X messages/day per number") come from vendors with no verifiable basis, so I left them out.
- I did not find the official wording of the Business Solution Terms clause on "AI Providers". Its content is confirmed by several reputable press outlets.
