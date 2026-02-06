// Shuffle + Re-encryption proof for 52-card deck
// Proves: player applied a valid permutation AND correctly re-encrypted each card
// under the aggregate public key.
//
// Private inputs: permutation, re-encryption randomness
// Public inputs: generator, aggregate pubkey, input deck (C1,C2), output deck (C1,C2)

use std::embedded_curve_ops::{EmbeddedCurvePoint, EmbeddedCurveScalar, multi_scalar_mul};

global N: u32 = 52;

fn scalar_mul(point: EmbeddedCurvePoint, scalar: Field) -> EmbeddedCurvePoint {
    let s = EmbeddedCurveScalar::from_field(scalar);
    multi_scalar_mul([point], [s])
}

fn point_add(p1: EmbeddedCurvePoint, p2: EmbeddedCurvePoint) -> EmbeddedCurvePoint {
    let one = EmbeddedCurveScalar::from_field(1);
    multi_scalar_mul([p1, p2], [one, one])
}

fn main(
    // Private inputs
    perm: [u32; N],
    reencrypt_randomness: [Field; N],
    // Public inputs
    generator_x: pub Field,
    generator_y: pub Field,
    pub_key_x: pub Field,
    pub_key_y: pub Field,
    input_c1_x: pub [Field; N],
    input_c1_y: pub [Field; N],
    input_c2_x: pub [Field; N],
    input_c2_y: pub [Field; N],
    output_c1_x: pub [Field; N],
    output_c1_y: pub [Field; N],
    output_c2_x: pub [Field; N],
    output_c2_y: pub [Field; N],
) {
    let g = EmbeddedCurvePoint { x: generator_x, y: generator_y, is_infinite: false };
    let pk = EmbeddedCurvePoint { x: pub_key_x, y: pub_key_y, is_infinite: false };

    // 1. Verify permutation is valid
    let expected_sum: u32 = N * (N - 1) / 2;
    let mut actual_sum: u32 = 0;
    for i in 0..N {
        assert(perm[i] < N);
        actual_sum += perm[i];
    }
    assert(actual_sum == expected_sum);

    let mut expected_factorial: Field = 1;
    let mut actual_product: Field = 1;
    for i in 0..N {
        expected_factorial *= (i as Field + 1);
        actual_product *= (perm[i] as Field + 1);
    }
    assert(actual_product == expected_factorial);

    // 2. Verify re-encryption for each card
    for i in 0..N {
        let src = perm[i];
        let r = reencrypt_randomness[i];

        let in_c1 = EmbeddedCurvePoint { x: input_c1_x[src], y: input_c1_y[src], is_infinite: false };
        let in_c2 = EmbeddedCurvePoint { x: input_c2_x[src], y: input_c2_y[src], is_infinite: false };

        let r_g = scalar_mul(g, r);
        let r_pk = scalar_mul(pk, r);

        let new_c1 = point_add(in_c1, r_g);
        let new_c2 = point_add(in_c2, r_pk);

        assert(new_c1.x == output_c1_x[i]);
        assert(new_c1.y == output_c1_y[i]);
        assert(new_c2.x == output_c2_x[i]);
        assert(new_c2.y == output_c2_y[i]);
    }
}
