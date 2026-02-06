"""
Generate test vectors for shuffle+re-encryption circuits.
Generates vectors for N=5, N=20, and N=52.
"""
import json

# BN254 scalar field = Grumpkin base field
p = 21888242871839275222246405745257275088548364400416034343698204186575808495617

def modinv(a, m):
    if a < 0:
        a = a % m
    g, x, _ = extended_gcd(a, m)
    if g != 1:
        raise Exception('Modular inverse does not exist')
    return x % m

def extended_gcd(a, b):
    if a == 0:
        return b, 0, 1
    g, x, y = extended_gcd(b % a, a)
    return g, y - (b // a) * x, x

def mod_sqrt(a, p):
    a = a % p
    if a == 0:
        return 0
    if pow(a, (p - 1) // 2, p) != 1:
        return None
    if p % 4 == 3:
        return pow(a, (p + 1) // 4, p)
    q = p - 1
    s = 0
    while q % 2 == 0:
        q //= 2
        s += 1
    z = 2
    while pow(z, (p - 1) // 2, p) != p - 1:
        z += 1
    m = s
    c = pow(z, q, p)
    t = pow(a, q, p)
    r = pow(a, (q + 1) // 2, p)
    while True:
        if t == 1:
            return r
        i = 0
        temp = t
        while temp != 1:
            temp = (temp * temp) % p
            i += 1
        b = pow(c, 1 << (m - i - 1), p)
        m = i
        c = (b * b) % p
        t = (t * c) % p
        r = (r * b) % p

def point_add(p1, p2, field_p):
    if p1 is None:
        return p2
    if p2 is None:
        return p1
    x1, y1 = p1
    x2, y2 = p2
    if x1 == x2 and y1 == (field_p - y2) % field_p:
        return None
    if x1 == x2 and y1 == y2:
        lam = (3 * x1 * x1) * modinv(2 * y1, field_p) % field_p
    else:
        lam = (y2 - y1) * modinv(x2 - x1, field_p) % field_p
    x3 = (lam * lam - x1 - x2) % field_p
    y3 = (lam * (x1 - x3) - y1) % field_p
    return (x3, y3)

def scalar_mul(point, scalar, field_p):
    result = None
    addend = point
    while scalar > 0:
        if scalar & 1:
            result = point_add(result, addend, field_p)
        addend = point_add(addend, addend, field_p)
        scalar >>= 1
    return result

# Grumpkin generator
gx = 1
gy_sq = (gx**3 - 17) % p
gy = mod_sqrt(gy_sq, p)
if gy > p // 2:
    gy = p - gy
G = (gx, gy)

def generate_vectors(N, perm):
    """Generate shuffle+re-encryption test vectors for N cards."""
    # Secret key and public key
    sk = 5
    PK = scalar_mul(G, sk, p)

    # Generate N "card" points: card_i = (i+1)*G
    cards = []
    for i in range(N):
        cards.append(scalar_mul(G, i + 1, p))

    # Initial encryption: encrypt each card with randomness r_init[i]
    # C1[i] = r_init[i] * G, C2[i] = card[i] + r_init[i] * PK
    import random
    random.seed(42)  # deterministic for reproducibility

    input_c1 = []
    input_c2 = []
    for i in range(N):
        r_init = random.randint(1, 100)  # small for testing
        c1 = scalar_mul(G, r_init, p)
        r_pk = scalar_mul(PK, r_init, p)
        c2 = point_add(cards[i], r_pk, p)
        input_c1.append(c1)
        input_c2.append(c2)

    # Re-encryption randomness for shuffle
    reencrypt_r = []
    for i in range(N):
        reencrypt_r.append(random.randint(1, 100))

    # Apply permutation and re-encrypt
    output_c1 = []
    output_c2 = []
    for i in range(N):
        src = perm[i]
        r = reencrypt_r[i]

        # Re-encrypt: new_C1 = old_C1[src] + r*G, new_C2 = old_C2[src] + r*PK
        r_g = scalar_mul(G, r, p)
        r_pk = scalar_mul(PK, r, p)
        new_c1 = point_add(input_c1[src], r_g, p)
        new_c2 = point_add(input_c2[src], r_pk, p)
        output_c1.append(new_c1)
        output_c2.append(new_c2)

    return {
        'perm': perm,
        'reencrypt_randomness': reencrypt_r,
        'generator': G,
        'pub_key': PK,
        'input_c1': input_c1,
        'input_c2': input_c2,
        'output_c1': output_c1,
        'output_c2': output_c2,
    }

def write_prover_toml(vectors, filepath):
    """Write Prover.toml for shuffle+re-encryption circuit."""
    lines = []
    N = len(vectors['perm'])

    lines.append(f'perm = {vectors["perm"]}')
    lines.append(f'reencrypt_randomness = {json.dumps([str(r) for r in vectors["reencrypt_randomness"]])}')
    lines.append(f'generator_x = "{vectors["generator"][0]}"')
    lines.append(f'generator_y = "{vectors["generator"][1]}"')
    lines.append(f'pub_key_x = "{vectors["pub_key"][0]}"')
    lines.append(f'pub_key_y = "{vectors["pub_key"][1]}"')

    for name, data in [('input_c1', vectors['input_c1']), ('input_c2', vectors['input_c2']),
                        ('output_c1', vectors['output_c1']), ('output_c2', vectors['output_c2'])]:
        xs = [str(pt[0]) for pt in data]
        ys = [str(pt[1]) for pt in data]
        lines.append(f'{name}_x = {json.dumps(xs)}')
        lines.append(f'{name}_y = {json.dumps(ys)}')

    with open(filepath, 'w') as f:
        f.write('\n'.join(lines) + '\n')
    print(f"Written {filepath}")

# N=52: rotation permutation (production circuit)
perm_52 = list(range(1, 52)) + [0]
vectors_52 = generate_vectors(52, perm_52)
write_prover_toml(vectors_52, '../shuffle_proof/Prover.toml')

print("Shuffle test vectors generated successfully!")
