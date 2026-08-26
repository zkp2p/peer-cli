import { encodeFunctionData, erc20Abi, parseUnits } from 'viem';
import type { CommandDefinition } from './framework.js';
import { sdkReadHandler, sdkWriteHandler } from './helpers.js';
import { createError } from '../output/errors.js';
import { asBigInt, parseJsonArray } from '../utils/parsing.js';
import {
  ensureAddress,
  ensureBoolean,
  ensurePositiveNumber,
  ensureString,
} from '../utils/validation.js';

function usdcUnits(value: unknown, field: string): bigint {
  return parseUnits(ensurePositiveNumber(value, field).toString(), 6);
}

const addressArgument = (name: string, description: string) => ({
  name,
  description,
  schema: { type: 'string' as const, description },
  optionFlags: [`--${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)} <address>`],
});

export const stakeDefinitions: CommandDefinition[] = [
  {
    path: ['stake', 'state'],
    description: 'Read the authoritative StakeVault state for a staker and optional taker.',
    readOnly: true,
    args: [addressArgument('staker', 'Stake owner address.')],
    options: [{ name: 'taker', flags: '--taker <address>', description: 'Optional taker address.', schema: { type: 'string', description: 'Taker address.' } }],
    handler: sdkReadHandler(['getStakeVaultState'], async (input) => [{
      staker: ensureAddress(input.staker, 'staker'),
      ...(input.taker ? { taker: ensureAddress(input.taker, 'taker') } : {}),
    }]),
  },
  {
    path: ['stake', 'indexed-state'],
    description: 'Read indexed staking, authorization, claim, and risk-window state with freshness metadata.',
    readOnly: true,
    args: [addressArgument('taker', 'Taker address.')],
    handler: async (input, context) => {
      const taker = ensureAddress(input.taker, 'taker');
      const { client } = await context.getClient({ requireWallet: false });
      const stakeOwner = await client.getStakeOwner(taker);
      const vault = client.getStakeVaultContract();
      const policy = client.getChargebackPolicyContract();
      return client.indexer.getStakingState({
        chainId: 8453,
        environment: context.config.env === 'staging' ? 'base_staging' : 'base',
        vaultAddress: vault.address,
        chargebackPolicyAddress: policy.address,
        taker,
        stakeOwner,
      });
    },
  },
  {
    path: ['stake', 'balance'],
    description: 'Read total stake owned by an address.',
    readOnly: true,
    args: [addressArgument('owner', 'Stake owner address.')],
    handler: sdkReadHandler(['getStakeBalance'], async (input) => [ensureAddress(input.owner, 'owner')]),
  },
  {
    path: ['stake', 'locked'],
    description: 'Read stake locked behind active chargeback windows.',
    readOnly: true,
    args: [addressArgument('owner', 'Stake owner address.')],
    handler: sdkReadHandler(['getLockedStake'], async (input) => [ensureAddress(input.owner, 'owner')]),
  },
  {
    path: ['stake', 'free'],
    description: 'Read stake available for withdrawal or a new lock.',
    readOnly: true,
    args: [addressArgument('owner', 'Stake owner address.')],
    handler: sdkReadHandler(['getFreeStake'], async (input) => [ensureAddress(input.owner, 'owner')]),
  },
  {
    path: ['stake', 'claimable'],
    description: 'Read non-stake USDC claimable by a beneficiary.',
    readOnly: true,
    args: [addressArgument('beneficiary', 'Claim beneficiary address.')],
    handler: sdkReadHandler(['getClaimable'], async (input) => [ensureAddress(input.beneficiary, 'beneficiary')]),
  },
  {
    path: ['stake', 'owner'],
    description: 'Resolve the effective stake owner backing a taker.',
    readOnly: true,
    args: [addressArgument('taker', 'Taker address.')],
    handler: sdkReadHandler(['getStakeOwner'], async (input) => [ensureAddress(input.taker, 'taker')]),
  },
  {
    path: ['stake', 'selected-owner'],
    description: 'Read the stake owner selected by a taker before authorization checks.',
    readOnly: true,
    args: [addressArgument('taker', 'Taker address.')],
    handler: sdkReadHandler(['getSelectedStakeOwner'], async (input) => [ensureAddress(input.taker, 'taker')]),
  },
  {
    path: ['stake', 'authorization'],
    description: 'Read whether a stake owner authorizes a taker.',
    readOnly: true,
    args: [
      addressArgument('owner', 'Stake owner address.'),
      addressArgument('taker', 'Taker address.'),
    ],
    handler: sdkReadHandler(['getTakerAuthorization'], async (input) => [
      ensureAddress(input.owner, 'owner'),
      ensureAddress(input.taker, 'taker'),
    ]),
  },
  {
    path: ['stake', 'admissions-paused'],
    description: 'Read whether chargebackable intent admissions are paused.',
    readOnly: true,
    handler: sdkReadHandler(['getAdmissionsPaused'], async () => []),
  },
  {
    path: ['stake', 'risk-window'],
    description: 'Read the minimum collateral lock window for a payment method.',
    readOnly: true,
    args: [{ name: 'paymentMethodHash', description: 'Payment method bytes32 hash.', schema: { type: 'string', description: 'Payment method hash.' }, optionFlags: ['--payment-method-hash <hash>'] }],
    handler: sdkReadHandler(['getRiskWindow'], async (input) => [ensureString(input.paymentMethodHash, 'paymentMethodHash')]),
  },
  {
    path: ['stake', 'chargeback-enabled'],
    description: 'Read whether a deposit has chargeback coverage enabled.',
    readOnly: true,
    args: [
      addressArgument('escrow', 'Escrow address.'),
      { name: 'depositId', description: 'Numeric deposit ID.', schema: { type: 'string', description: 'Deposit ID.' }, optionFlags: ['--deposit-id <id>'] },
    ],
    handler: sdkReadHandler(['isChargebackEnabled'], async (input) => [
      ensureAddress(input.escrow, 'escrow'),
      asBigInt(input.depositId, 'depositId'),
    ]),
  },
  {
    path: ['stake', 'ensure-allowance'],
    description: 'Approve StakeVault USDC spending if required.',
    readOnly: false,
    requireWallet: true,
    args: [{ name: 'amount', description: 'USDC amount to approve.', schema: { type: 'number', description: 'USDC amount.' }, optionFlags: ['--amount <value>'] }],
    options: [
      { name: 'maxApprove', flags: '--max-approve', description: 'Approve MaxUint256 instead of the exact amount.', schema: { type: 'boolean', description: 'Approve maximum amount.' } },
    ],
    handler: async (input, context) => {
      const { client, publicClient, walletClient } = await context.getClient({ requireWallet: true });
      const account = walletClient.account;
      if (!account) {
        throw createError('AUTH_REQUIRED', 'This command requires a signer account.');
      }
      const amount = usdcUnits(input.amount, 'amount');
      const { address: spender, stakeToken: token } = client.getStakeVaultContract();
      const currentAllowance = await publicClient.readContract({
        address: token,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [account.address, spender],
      });
      if (currentAllowance >= amount) {
        return {
          hadAllowance: true,
          token,
          spender,
          currentAllowance: currentAllowance.toString(),
          requiredAmount: amount.toString(),
        };
      }
      const approvalAmount = Boolean(input.maxApprove) ? (1n << 256n) - 1n : amount;
      return context.runPrepared({
        description: `Approve ${approvalAmount.toString()} units for StakeVault ${spender}.`,
        prepare: async () => ({
          prepared: {
            to: token,
            data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [spender, approvalAmount] }),
            value: 0n,
            chainId: 8453,
          },
          previewData: {
            token,
            spender,
            currentAllowance: currentAllowance.toString(),
            requiredAmount: amount.toString(),
            approvalAmount: approvalAmount.toString(),
          },
        }),
        execute: async () => client.ensureStakeAllowance({ amount, maxApprove: Boolean(input.maxApprove) }),
      });
    },
  },
  {
    path: ['stake', 'deposit'],
    description: 'Deposit USDC into StakeVault.',
    readOnly: false,
    requireWallet: true,
    args: [{ name: 'amount', description: 'USDC amount to stake.', schema: { type: 'number', description: 'USDC amount.' }, optionFlags: ['--amount <value>'] }],
    handler: sdkWriteHandler(['depositStake'], async (input) => ({ amount: usdcUnits(input.amount, 'amount') })),
  },
  {
    path: ['stake', 'withdraw'],
    description: 'Withdraw free stake from StakeVault.',
    readOnly: false,
    dangerous: true,
    requireWallet: true,
    args: [{ name: 'amount', description: 'USDC amount to withdraw.', schema: { type: 'number', description: 'USDC amount.' }, optionFlags: ['--amount <value>'] }],
    handler: sdkWriteHandler(['withdrawStake'], async (input) => ({ amount: usdcUnits(input.amount, 'amount') })),
  },
  {
    path: ['stake', 'claim'],
    description: 'Withdraw the signer’s complete claimable USDC balance.',
    readOnly: false,
    requireWallet: true,
    handler: sdkWriteHandler(['claim'], async () => ({})),
  },
  {
    path: ['stake', 'authorize'],
    description: 'Grant or revoke a taker’s access to the signer’s stake.',
    readOnly: false,
    requireWallet: true,
    args: [
      addressArgument('taker', 'Taker address.'),
      { name: 'authorized', description: 'Whether the taker is authorized.', schema: { type: 'boolean', description: 'Authorization state.' }, optionFlags: ['--authorized <boolean>'] },
    ],
    handler: sdkWriteHandler(['setTakerAuthorization'], async (input) => ({
      taker: ensureAddress(input.taker, 'taker'),
      authorized: ensureBoolean(input.authorized, 'authorized'),
    })),
  },
  {
    path: ['stake', 'select-owner'],
    description: 'Select the stake owner backing the signer as taker.',
    readOnly: false,
    requireWallet: true,
    args: [addressArgument('owner', 'Stake owner address.')],
    handler: sdkWriteHandler(['selectStakeOwner'], async (input) => ({ stakeOwner: ensureAddress(input.owner, 'owner') })),
  },
  {
    path: ['stake', 'clear-owner'],
    description: 'Clear the signer’s selected stake owner and return to self-stake.',
    readOnly: false,
    requireWallet: true,
    handler: sdkWriteHandler(['clearStakeOwner'], async () => ({})),
  },
  {
    path: ['stake', 'release-matured'],
    description: 'Release one matured chargeback intent and unlock its stake cover.',
    readOnly: false,
    requireWallet: true,
    args: [{ name: 'intentHash', description: 'Intent hash.', schema: { type: 'string', description: 'Intent hash.' }, optionFlags: ['--intent-hash <hash>'] }],
    options: [{ name: 'policy', flags: '--policy <address>', description: 'Optional snapshotted chargeback policy address.', schema: { type: 'string', description: 'Chargeback policy address.' } }],
    handler: sdkWriteHandler(['releaseMaturedChargebackIntent'], async (input) => ({
      intentHash: ensureString(input.intentHash, 'intentHash'),
      ...(input.policy ? { chargebackPolicyAddress: ensureAddress(input.policy, 'policy') } : {}),
    })),
  },
  {
    path: ['stake', 'release-matured-batch'],
    description: 'Release multiple matured chargeback intents in one transaction.',
    readOnly: false,
    requireWallet: true,
    args: [{ name: 'intentHashes', description: 'JSON array of intent hashes.', schema: { type: 'array', description: 'Intent hashes.' }, optionFlags: ['--intent-hashes <json>'] }],
    options: [
      { name: 'policy', flags: '--policy <address>', description: 'Optional snapshotted chargeback policy address.', schema: { type: 'string', description: 'Chargeback policy address.' } },
    ],
    handler: sdkWriteHandler(['releaseMaturedChargebackIntents'], async (input) => ({
      intentHashes: parseJsonArray(input.intentHashes, 'intentHashes').map((hash, index) => ensureString(hash, `intentHashes[${index}]`)),
      ...(input.policy ? { chargebackPolicyAddress: ensureAddress(input.policy, 'policy') } : {}),
    })),
  },
];

export const guardianDefinitions: CommandDefinition[] = [
  {
    path: ['guardian', 'available'],
    description: 'Check whether the selected environment has an IntentGuardian deployment.',
    readOnly: true,
    handler: sdkReadHandler(['hasIntentGuardian'], async () => []),
  },
  {
    path: ['guardian', 'policy'],
    description: 'Read the live IntentGuardian fee and extension policy.',
    readOnly: true,
    handler: sdkReadHandler(['getIntentGuardianPolicy'], async () => []),
  },
  {
    path: ['guardian', 'quote-extension'],
    description: 'Quote the authoritative on-chain cost to extend an intent.',
    readOnly: true,
    args: [
      { name: 'intentAmount', description: 'Intent deposit-token amount in base units.', schema: { type: 'string', description: 'Intent token amount in base units.' }, optionFlags: ['--intent-amount <baseUnits>'] },
      { name: 'additionalSeconds', description: 'Requested extension in seconds.', schema: { type: 'string', description: 'Extension seconds.' }, optionFlags: ['--additional-seconds <seconds>'] },
    ],
    handler: sdkReadHandler(['quoteIntentExtension'], async (input) => [{
      intentAmount: asBigInt(input.intentAmount, 'intentAmount'),
      additionalTime: asBigInt(input.additionalSeconds, 'additionalSeconds'),
    }]),
  },
  {
    path: ['guardian', 'payer-funding'],
    description: 'Read payer token balance and allowance available to IntentGuardian.',
    readOnly: true,
    args: [
      addressArgument('payer', 'Payer address.'),
      addressArgument('token', 'Deposit token address.'),
    ],
    handler: sdkReadHandler(['getIntentGuardianPayerFunding'], async (input) => [{
      payer: ensureAddress(input.payer, 'payer'),
      token: ensureAddress(input.token, 'token'),
    }]),
  },
  {
    path: ['guardian', 'extend-intent'],
    description: 'Extend a live intent with an explicit maximum cost.',
    readOnly: false,
    requireWallet: true,
    args: [
      addressArgument('escrow', 'Escrow address.'),
      { name: 'depositId', description: 'Numeric deposit ID.', schema: { type: 'string', description: 'Deposit ID.' }, optionFlags: ['--deposit-id <id>'] },
      { name: 'intentHash', description: 'Intent hash.', schema: { type: 'string', description: 'Intent hash.' }, optionFlags: ['--intent-hash <hash>'] },
      { name: 'additionalSeconds', description: 'Requested extension in seconds.', schema: { type: 'string', description: 'Extension seconds.' }, optionFlags: ['--additional-seconds <seconds>'] },
      { name: 'maxCost', description: 'Maximum deposit-token cost in base units.', schema: { type: 'string', description: 'Maximum token cost in base units.' }, optionFlags: ['--max-cost <baseUnits>'] },
    ],
    handler: sdkWriteHandler(['extendIntentLifetime'], async (input) => ({
      escrow: ensureAddress(input.escrow, 'escrow'),
      depositId: asBigInt(input.depositId, 'depositId'),
      intentHash: ensureString(input.intentHash, 'intentHash'),
      additionalTime: asBigInt(input.additionalSeconds, 'additionalSeconds'),
      maxCost: asBigInt(input.maxCost, 'maxCost'),
    })),
  },
];
