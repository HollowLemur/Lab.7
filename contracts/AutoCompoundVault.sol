// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IUniswapV2Router {
    function getAmountsOut(uint256 amountIn, address[] calldata path)
        external
        view
        returns (uint256[] memory amounts);

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);
}

/// @title AutoCompoundVault
/// @notice ERC-20 share vault. Anyone may reinvest donated/accrued reward tokens through a V2 router.
contract AutoCompoundVault is ERC20, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 private constant VIRTUAL_SHARES = 1e6;
    uint256 private constant VIRTUAL_ASSETS = 1;

    IERC20 public immutable asset;
    IERC20 public immutable rewardToken;
    IUniswapV2Router public immutable router;

    event Deposit(address indexed caller, address indexed owner, uint256 assets, uint256 shares);
    event Withdraw(address indexed caller, address indexed receiver, address indexed owner, uint256 assets, uint256 shares);
    event Compounded(uint256 rewardSold, uint256 assetsReceived);

    error ZeroAddress();
    error InvalidTokens();
    error ZeroAmount();
    error InsufficientShares();
    error NoRewardToCompound();
    error MinimumOutputNotMet(uint256 received, uint256 minimum);

    constructor(address asset_, address rewardToken_, address router_)
        ERC20("Vault Token A Shares", "vTA")
    {
        if (asset_ == address(0) || rewardToken_ == address(0) || router_ == address(0)) revert ZeroAddress();
        if (asset_ == rewardToken_) revert InvalidTokens();
        asset = IERC20(asset_);
        rewardToken = IERC20(rewardToken_);
        router = IUniswapV2Router(router_);
    }

    /// @dev Six extra share decimals enable virtual-share protection against first-deposit inflation.
    function decimals() public pure override returns (uint8) {
        return 24;
    }

    /// @notice The base asset balance held by the vault.
    function totalAssets() public view returns (uint256) {
        return asset.balanceOf(address(this));
    }

    function convertToShares(uint256 assets) public view returns (uint256) {
        return Math.mulDiv(assets, totalSupply() + VIRTUAL_SHARES, totalAssets() + VIRTUAL_ASSETS);
    }

    function convertToAssets(uint256 shares) public view returns (uint256) {
        return Math.mulDiv(shares, totalAssets() + VIRTUAL_ASSETS, totalSupply() + VIRTUAL_SHARES);
    }

    function deposit(uint256 assets, address receiver) external nonReentrant returns (uint256 shares) {
        if (assets == 0) revert ZeroAmount();
        if (receiver == address(0)) revert ZeroAddress();
        shares = convertToShares(assets);
        if (shares == 0) revert ZeroAmount();

        asset.safeTransferFrom(msg.sender, address(this), assets);
        _mint(receiver, shares);
        emit Deposit(msg.sender, receiver, assets, shares);
    }

    function redeem(uint256 shares, address receiver, address owner)
        external
        nonReentrant
        returns (uint256 assets)
    {
        if (shares == 0) revert ZeroAmount();
        if (receiver == address(0) || owner == address(0)) revert ZeroAddress();
        if (msg.sender != owner) _spendAllowance(owner, msg.sender, shares);
        assets = convertToAssets(shares);
        if (assets == 0 || assets > totalAssets()) revert InsufficientShares();

        _burn(owner, shares);
        asset.safeTransfer(receiver, assets);
        emit Withdraw(msg.sender, receiver, owner, assets, shares);
    }

    /// @notice Swaps the whole reward-token balance back to the base asset and leaves proceeds in this vault.
    /// @dev The caller supplies a slippage bound; the transaction reverts if the router returns less.
    function compound(uint256 minAmountOut) external nonReentrant returns (uint256 assetsReceived) {
        uint256 rewardAmount = rewardToken.balanceOf(address(this));
        if (rewardAmount == 0) revert NoRewardToCompound();

        address[] memory path = new address[](2);
        path[0] = address(rewardToken);
        path[1] = address(asset);

        uint256 assetsBefore = totalAssets();
        rewardToken.forceApprove(address(router), rewardAmount);
        router.swapExactTokensForTokens(
            rewardAmount,
            minAmountOut,
            path,
            address(this),
            block.timestamp + 300
        );
        rewardToken.forceApprove(address(router), 0);

        assetsReceived = totalAssets() - assetsBefore;
        if (assetsReceived < minAmountOut) revert MinimumOutputNotMet(assetsReceived, minAmountOut);
        emit Compounded(rewardAmount, assetsReceived);
    }
}
