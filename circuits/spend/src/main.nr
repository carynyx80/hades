// Spend a shielded note: proves the note is in the pool's Merkle tree, reveals its nullifier hash,
// takes `public_amount` out (for a bet or a withdrawal) and writes the rest to a fresh change note.
// Hashes are circomlib-compatible Poseidon over BN254, matching poseidon-solidity's PoseidonT3 on-chain.
use poseidon::poseidon::bn254::hash_2;

global DEPTH: u32 = 20;

fn main(
    root: pub Field,
    nullifier_hash: pub Field,
    public_amount: pub Field,
    change_commitment: pub Field,
    ext_data_hash: pub Field,
    amount: Field,
    secret: Field,
    nullifier: Field,
    path: [Field; DEPTH],
    index_bits: [u1; DEPTH],
    change_inner: Field,
) {
    // note = Poseidon(amount, Poseidon(secret, nullifier))
    let inner = hash_2([secret, nullifier]);
    let mut node = hash_2([amount, inner]);
    for i in 0..DEPTH {
        node = if index_bits[i] == 1 { hash_2([path[i], node]) } else { hash_2([node, path[i]]) };
    }
    assert(node == root, "note not in tree");
    assert(nullifier_hash == hash_2([nullifier, 0]), "bad nullifier");

    // Amounts are 128-bit, so the subtraction below cannot wrap around the field.
    amount.assert_max_bit_size::<128>();
    public_amount.assert_max_bit_size::<128>();
    let change = amount - public_amount;
    change.assert_max_bit_size::<128>();
    assert(change_commitment == hash_2([change, change_inner]), "bad change note");

    // ext_data_hash (recipient, relayer fee, bet details) is bound by being a public input.
    let _ = ext_data_hash;
}

#[test]
fn spends_a_single_note() {
    let secret = 11;
    let nullifier = 22;
    let amount = 1000;
    let mut path = [0; DEPTH];
    let index_bits = [0; DEPTH];
    let mut node = hash_2([amount, hash_2([secret, nullifier])]);
    for i in 0..DEPTH {
        path[i] = i as Field + 1;
        node = hash_2([node, path[i]]);
    }
    main(node, hash_2([nullifier, 0]), 400, hash_2([600, 33]), 5, amount, secret, nullifier, path, index_bits, 33);
}
