// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * Route B challenger (spike / roadmap).
 *
 * Intended flow:
 * - Owner funds this vault's exchange subaccount via Bank/Exchange precompile.
 * - Owner authorizes agent EOA(s) as callers only — not as exchange actors.
 * - Agent calls createDerivativeLimitOrderGuarded(...); vault checks allowlist + notional.
 * - Vault calls Exchange Precompile 0x0000000000000000000000000000000000000065.
 *
 * Deploy + wire ABI after Route B smoke passes (`npm run route-b:smoke`).
 * See docs/ROUTE-B.md.
 */
contract IntentGuardPolicyVault {
    address public constant EXCHANGE_PRECOMPILE =
        0x0000000000000000000000000000000000000065;

    address public owner;
    mapping(address => bool) public agents;
    mapping(bytes32 => bool) public allowedMarkets;
    uint256 public maxOrderNotional; // quote atoms, vault-local semantics

    event AgentSet(address indexed agent, bool allowed);
    event MarketSet(bytes32 indexed marketId, bool allowed);

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    modifier onlyAgent() {
        require(agents[msg.sender], "not agent");
        _;
    }

    constructor(address owner_, uint256 maxNotional_) {
        owner = owner_;
        maxOrderNotional = maxNotional_;
    }

    function setAgent(address agent, bool allowed) external onlyOwner {
        agents[agent] = allowed;
        emit AgentSet(agent, allowed);
    }

    function setMarket(bytes32 marketId, bool allowed) external onlyOwner {
        allowedMarkets[marketId] = allowed;
        emit MarketSet(marketId, allowed);
    }

  /**
   * Policy gate — precompile call wired in follow-up spike (requires generated IExchange ABI).
   */
    function createDerivativeLimitOrderGuarded(
        bytes32 marketId,
        uint256 price,
        uint256 quantity,
        uint256 margin
    ) external onlyAgent {
        require(allowedMarkets[marketId], "market not allowed");
        require(price * quantity <= maxOrderNotional, "notional exceeded");
        require(margin > 0, "margin required");
        // TODO: delegatecall / staticcall into EXCHANGE_PRECOMPILE with vault subaccount auth
        marketId;
        price;
        quantity;
        margin;
        revert("Route B: precompile bridge not wired in hackathon spike");
    }
}
