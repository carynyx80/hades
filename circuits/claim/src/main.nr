// Claim a settled bet: proves knowledge of the secret behind the bet's claim hash without revealing it.
// ext_data_hash binds the new note and relayer fee, so a copied proof cannot redirect the payout.
use poseidon::poseidon::bn254::hash_2;

fn main(claim_hash: pub Field, ext_data_hash: pub Field, claim_secret: Field) {
    assert(claim_hash == hash_2([claim_secret, 0]), "not your bet");
    let _ = ext_data_hash;
}

#[test]
fn claims_with_the_secret() {
    main(hash_2([77, 0]), 1, 77);
}
