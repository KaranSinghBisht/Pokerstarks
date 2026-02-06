// Decrypt (reveal token) proof
// Proves: player correctly computed their partial decryption token
//
// Given: public_key PK, ciphertext component C1, reveal_token T, generator G
// Prove: there exists secret_key sk such that:
//   PK = sk * G
//   T  = sk * C1
//
// This is the core primitive for card dealing and showdown.

use std::embedded_curve_ops::{EmbeddedCurvePoint, EmbeddedCurveScalar, multi_scalar_mul};

fn scalar_mul(point: EmbeddedCurvePoint, scalar: Field) -> EmbeddedCurvePoint {
    let s = EmbeddedCurveScalar::from_field(scalar);
    multi_scalar_mul([point], [s])
}

fn main(
    // Private input
    secret_key: Field,
    // Public inputs
    generator_x: pub Field,
    generator_y: pub Field,
    pub_key_x: pub Field,
    pub_key_y: pub Field,
    c1_x: pub Field,
    c1_y: pub Field,
    token_x: pub Field,
    token_y: pub Field,
) {
    let g = EmbeddedCurvePoint { x: generator_x, y: generator_y, is_infinite: false };
    let c1 = EmbeddedCurvePoint { x: c1_x, y: c1_y, is_infinite: false };

    // Verify PK = sk * G
    let computed_pk = scalar_mul(g, secret_key);
    assert(computed_pk.x == pub_key_x);
    assert(computed_pk.y == pub_key_y);

    // Verify T = sk * C1
    let computed_token = scalar_mul(c1, secret_key);
    assert(computed_token.x == token_x);
    assert(computed_token.y == token_y);
}
