"""
Generate test vectors for decrypt (reveal token) proof circuit.
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

# Test scenario: player has secret key sk, public key PK = sk*G
# Card has C1 component, player computes reveal token T = sk*C1
sk = 7
PK = scalar_mul(G, sk, p)

# C1 = some random point (simulate r*G from encryption)
r_encrypt = 13
C1 = scalar_mul(G, r_encrypt, p)

# Reveal token T = sk * C1
T = scalar_mul(C1, sk, p)

# Write Prover.toml
lines = []
lines.append(f'secret_key = "{sk}"')
lines.append(f'generator_x = "{G[0]}"')
lines.append(f'generator_y = "{G[1]}"')
lines.append(f'pub_key_x = "{PK[0]}"')
lines.append(f'pub_key_y = "{PK[1]}"')
lines.append(f'c1_x = "{C1[0]}"')
lines.append(f'c1_y = "{C1[1]}"')
lines.append(f'token_x = "{T[0]}"')
lines.append(f'token_y = "{T[1]}"')

with open('../decrypt_proof/Prover.toml', 'w') as f:
    f.write('\n'.join(lines) + '\n')

print(f"Generator G = ({G[0]}, {G[1]})")
print(f"Secret key sk = {sk}")
print(f"Public key PK = ({PK[0]}, {PK[1]})")
print(f"C1 = ({C1[0]}, {C1[1]})")
print(f"Token T = ({T[0]}, {T[1]})")
print(f"\nWritten decrypt_proof/Prover.toml")
