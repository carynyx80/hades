# Primar circuits (Noir)

| Circuit | Public inputs | Proves |
|---|---|---|
| `spend` | root, nullifierHash, publicAmount, changeCommitment, extDataHash | a note is in the pool, it hasn't been spent, and `publicAmount` leaves it with the rest in a change note |
| `claim` | claimHash, extDataHash | knowledge of the secret behind a bet's claim hash |

Hashes are circomlib Poseidon on BN254 so they match `PoseidonT3` in `PrimarPool`.

## Build verifiers

Requires [nargo](https://noir-lang.org) and [bb](https://github.com/AztecProtocol/aztec-packages/tree/master/barretenberg).

```bash
cd circuits/spend && nargo test && nargo compile && bb write_vk -b target/primar_spend.json -o target --oracle_hash keccak && bb write_solidity_verifier -k target/vk -o ../../contracts/src/verifiers/SpendVerifier.sol
```

```bash
cd circuits/claim && nargo test && nargo compile && bb write_vk -b target/primar_claim.json -o target --oracle_hash keccak && bb write_solidity_verifier -k target/vk -o ../../contracts/src/verifiers/ClaimVerifier.sol
```

The generated verifiers expose `verify(bytes, bytes32[])`, which is what `PrimarPool` calls.
