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

/// Validate that a point is on the Grumpkin curve: y^2 = x^3 - 17
fn assert_on_curve(p: EmbeddedCurvePoint) {
    if !p.is_infinite {
        let y_sq = p.y * p.y;
        let x_cu = p.x * p.x * p.x;
        // Grumpkin: y^2 = x^3 + b where b = -17
        assert(y_sq == x_cu - 17, "point not on curve");
    }
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

    // Validate generator and public key are on the curve
    assert_on_curve(g);
    assert_on_curve(pk);

    // 1. Verify permutation is valid
    //
    // A-02 FIX: Use a seen-array approach instead of sum+product.
    // The previous sum+product approach was unsound — counterexample:
    // {0,0,8,9} replacing {0,1,2,14} has same sum=17 and product(+1)=90.
    // The seen-array guarantees each index appears exactly once.
    let mut seen: [bool; N] = [false; N];
    for i in 0..N {
        assert(perm[i] < N, "perm index out of range");
        assert(!seen[perm[i]], "duplicate in permutation");
        seen[perm[i]] = true;
    }

    // 2. Verify re-encryption for each card
    for i in 0..N {
        let src = perm[i];
        let r = reencrypt_randomness[i];

        // Ensure randomness is non-zero (r=0 would mean no re-encryption,
        // allowing the shuffler to track cards through the shuffle)
        assert(r != 0, "randomness must be non-zero");

        let in_c1 = EmbeddedCurvePoint { x: input_c1_x[src], y: input_c1_y[src], is_infinite: false };
        let in_c2 = EmbeddedCurvePoint { x: input_c2_x[src], y: input_c2_y[src], is_infinite: false };

        // Validate input deck points are on the curve
        assert_on_curve(in_c1);
        assert_on_curve(in_c2);

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
