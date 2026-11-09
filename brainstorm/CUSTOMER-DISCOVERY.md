# IntentGuard — customer discovery

**Objective this week:** Not “Do you like IntentGuard?”  
Find **5 teams with the problem now** and **2 that will integrate a prototype**.

Targets: 10–12 interviews · ≥5 Injective agent builders · ≥3 financial operators · 1 paid-pilot conversation.

Do **not** open by pitching the product. Ask about their last real execution path first.

## Primary ICP

Injective-native trading-agent / DeFi automation teams that:

- Already build on Injective
- Have (or will have) an agent that submits orders
- Use or plan an automated signer
- Understand exchange subaccounts
- Will not hand the primary wallet to an agent
- Can decide an integration within ~2 weeks

**Anti-persona:** retail toy bots with no budget; institutions needing audited custody Day 1; people who only want a free AuthZ frontend.

## Interview questions — Injective AI / trading-agent builders

1. Walk me through the last time an AI agent actually executed a financial transaction on Injective.
2. Where does the signing authority live, and which component can access it?
3. What prevents the agent from executing a different message, market, or order size than intended?
4. What is your current process for limiting exposure, restricting markets, and revoking agent authority?
5. Have you experienced an unexpected agent action, unauthorized trade, compromised tool, or execution mistake? What happened?
6. What would make you trust a delegated agent with $1,000 of trading capital rather than $100?
7. If you could remove one part of your current wallet/auth/risk stack, which would it be?
8. Would you integrate an independent execution policy SDK? What would it need to justify the effort?
9. What would you pay today: per agent, per tx, monthly, or enterprise?
10. What would block adoption: latency, custody, integration complexity, lack of protocol enforcement, other?

## Interview questions — funds / prop desks

1. Which trading activities are automated, and what fraction of order flow is machine-generated?
2. How are strategy permissions separated from treasury today?
3. Where are trade limits enforced: exchange, gateway, signer, risk engine, or monitoring?
4. How are subaccounts allocated to strategies?
5. What happens when a strategy exceeds its mandate?
6. How quickly can you revoke a strategy’s trading authority?
7. How do you prove after an incident that a strategy stayed within authorization?
8. Would you allow an external policy engine in the execution path?
9. What would a security review require before production?
10. What annual cost would reduced risk / ops effort / faster agent deploy justify?

## Validation bar

| Signal | Pass |
|--------|------|
| Named existing strategy on Injective | Concrete, not hypothetical |
| Real delegated or funded subaccount use | Yes |
| Pain beyond “AuthZ UI nice-to-have” | Incident, near-miss, or blocked deploy |
| Preference for independent enforcement | Explicit |
| Integration within 2 weeks | Named engineer |
| Willingness to discuss paid pilot | Budget owner or price band |

## Log

| Date | Who / segment | Key finding | Integrate? | Pay signal |
|------|---------------|-------------|------------|------------|
| | | | | |
