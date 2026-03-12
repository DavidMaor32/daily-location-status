"""Decode App.jsx Hebrew corruption using reverse CP1252 lookup."""
import codecs
import sys

# Build reverse CP1252 lookup: unicode_char -> cp1252_byte
cp1252_reverse = {}
for byte_val in range(256):
    try:
        uni_char = bytes([byte_val]).decode('cp1252')
        cp1252_reverse[uni_char] = byte_val
    except Exception:
        pass

def decode_one_pass(data):
    """Decode one pass of the simple corruption:
    \xd7\xb3 + UTF8(CP1252(X)) -> \xd7\x{X}
    \xd6\xb2 + UTF8(CP1252(X)) -> \xd6\x{X}
    """
    result = bytearray()
    i = 0
    while i < len(data):
        found = False
        for prefix_b0, prefix_b1, lead_byte in [(0xd7, 0xb3, 0xd7), (0xd6, 0xb2, 0xd6)]:
            if (i + 1 < len(data) and data[i] == prefix_b0 and data[i+1] == prefix_b1):
                i += 2
                if i >= len(data):
                    result.append(prefix_b0)
                    result.append(prefix_b1)
                    found = True
                    break
                b = data[i]
                # Determine UTF-8 sequence length
                if b < 0x80:
                    n = 1
                elif b < 0xc0:
                    # Invalid UTF-8 lead, pass through
                    result.append(prefix_b0)
                    result.append(prefix_b1)
                    found = True
                    break
                elif b < 0xe0:
                    n = 2
                elif b < 0xf0:
                    n = 3
                else:
                    n = 4

                try:
                    uni_char = data[i:i+n].decode('utf-8')
                except Exception:
                    result.append(prefix_b0)
                    result.append(prefix_b1)
                    found = True
                    break

                if uni_char in cp1252_reverse:
                    result.append(lead_byte)
                    result.append(cp1252_reverse[uni_char])
                    i += n
                else:
                    # Cannot reverse - keep as is
                    result.append(prefix_b0)
                    result.append(prefix_b1)
                    result.extend(data[i:i+n])
                    i += n
                found = True
                break

        if not found:
            result.append(data[i])
            i += 1

    return bytes(result)

with open('frontend/src/App.jsx', 'rb') as f:
    app_data = f.read()

# Apply decode passes until no more corruption
d = app_data
for pass_num in range(1, 6):
    d_new = decode_one_pass(d)
    count = d_new.count(b'\xd7\xb3') + d_new.count(b'\xd6\xb2')
    count_prev = d.count(b'\xd7\xb3') + d.count(b'\xd6\xb2')
    print(f'Pass {pass_num}: {count_prev} -> {count} corruption markers')
    if d_new == d:
        print('  Converged!')
        break
    d = d_new

# Check UTF-8 validity
try:
    text = d.decode('utf-8')
    print('Result is valid UTF-8!')
except UnicodeDecodeError as e:
    print(f'UTF-8 error: {e}')

# Find and show corrupted/Hebrew lines
lines_out = d.split(b'\n')
hebrew_lines = [(i+1, line) for i, line in enumerate(lines_out) if b'\xd7\xb3' in line or b'\xd6\xb2' in line]
print(f'\nStill-corrupted lines: {len(hebrew_lines)}')

# Show a few decoded Hebrew lines
for lnum, line in lines_out[:10]:
    pass

# Show some specific lines (setError, window.confirm, window.alert, h1, labels)
interesting = [(i+1, line) for i, line in enumerate(lines_out)
               if any(kw in line for kw in [b'setError(', b'window.confirm', b'window.alert', b'<h1>', b'<label'])]
print(f'\nInteresting lines count: {len(interesting)}')
for lnum, line in interesting[:5]:
    try:
        print(f'  L{lnum}: {line.decode("utf-8", errors="replace")[:100]}')
    except Exception:
        print(f'  L{lnum}: {repr(line[:80])}')

# Write the decoded version
outpath = 'frontend/src/App.jsx.decoded'
with open(outpath, 'wb') as f:
    f.write(d)
print(f'\nWritten to {outpath}')
