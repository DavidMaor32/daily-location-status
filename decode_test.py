"""Test decoding the App.jsx Hebrew corruption."""

import codecs

# Build reverse CP1252 lookup: unicode_char -> cp1252_byte
cp1252_reverse = {}
for byte_val in range(0, 256):
    try:
        uni_char = bytes([byte_val]).decode('cp1252')
        cp1252_reverse[uni_char] = byte_val
    except (UnicodeDecodeError, ValueError):
        pass

def decode_one_pass(data: bytes) -> bytes:
    """Decode one pass of the simple corruption:
    \xd7\xb3 + UTF8(CP1252(X)) -> \xd7\x{X}
    \xd6\xb2 + UTF8(CP1252(X)) -> \xd6\x{X}
    """
    result = bytearray()
    i = 0
    while i < len(data):
        # Check for \xd7\xb3 prefix (corrupted \xd7\xXX)
        if i + 1 < len(data) and data[i] == 0xd7 and data[i+1] == 0xb3:
            i += 2  # skip the prefix
            # Read next UTF-8 char
            if i >= len(data):
                result.extend(b'\xd7\xb3')
                break
            lead = data[i]
            if lead < 0x80:
                uni_char = chr(lead)
                n = 1
            elif lead < 0xc0:
                # Invalid lead byte
                result.extend(b'\xd7\xb3')
                result.append(lead)
                i += 1
                continue
            elif lead < 0xe0:
                n = 2
                if i + 1 >= len(data):
                    result.extend(b'\xd7\xb3')
                    result.append(lead)
                    i += 1
                    continue
                try:
                    uni_char = data[i:i+n].decode('utf-8')
                except UnicodeDecodeError:
                    result.extend(b'\xd7\xb3')
                    result.append(lead)
                    i += 1
                    continue
            elif lead < 0xf0:
                n = 3
                if i + 2 >= len(data):
                    result.extend(b'\xd7\xb3')
                    result.append(lead)
                    i += 1
                    continue
                try:
                    uni_char = data[i:i+n].decode('utf-8')
                except UnicodeDecodeError:
                    result.extend(b'\xd7\xb3')
                    result.append(lead)
                    i += 1
                    continue
            else:
                n = 4
                if i + 3 >= len(data):
                    result.extend(b'\xd7\xb3')
                    result.append(lead)
                    i += 1
                    continue
                try:
                    uni_char = data[i:i+n].decode('utf-8')
                except UnicodeDecodeError:
                    result.extend(b'\xd7\xb3')
                    result.append(lead)
                    i += 1
                    continue

            # Look up reverse CP1252
            if uni_char in cp1252_reverse:
                second_byte = cp1252_reverse[uni_char]
                result.append(0xd7)
                result.append(second_byte)
                i += n
            else:
                # Can't reverse, keep as is
                result.extend(b'\xd7\xb3')
                result.extend(data[i:i+n])
                i += n

        # Check for \xd6\xb2 prefix (corrupted \xd6\xXX)
        elif i + 1 < len(data) and data[i] == 0xd6 and data[i+1] == 0xb2:
            i += 2  # skip the prefix
            if i >= len(data):
                result.extend(b'\xd6\xb2')
                break
            lead = data[i]
            if lead < 0x80:
                uni_char = chr(lead)
                n = 1
            elif lead < 0xc0:
                result.extend(b'\xd6\xb2')
                result.append(lead)
                i += 1
                continue
            elif lead < 0xe0:
                n = 2
                try:
                    uni_char = data[i:i+n].decode('utf-8')
                except UnicodeDecodeError:
                    result.extend(b'\xd6\xb2')
                    result.append(lead)
                    i += 1
                    continue
            elif lead < 0xf0:
                n = 3
                try:
                    uni_char = data[i:i+n].decode('utf-8')
                except UnicodeDecodeError:
                    result.extend(b'\xd6\xb2')
                    result.append(lead)
                    i += 1
                    continue
            else:
                n = 4
                try:
                    uni_char = data[i:i+n].decode('utf-8')
                except UnicodeDecodeError:
                    result.extend(b'\xd6\xb2')
                    result.append(lead)
                    i += 1
                    continue

            if uni_char in cp1252_reverse:
                second_byte = cp1252_reverse[uni_char]
                result.append(0xd6)
                result.append(second_byte)
                i += n
            else:
                result.extend(b'\xd6\xb2')
                result.extend(data[i:i+n])
                i += n

        else:
            result.append(data[i])
            i += 1

    return bytes(result)


# Test on known PersonFormModal "בבית"
corrupted_bivit = b'\xd7\xb3\xe2\x80\x98\xd7\xb3\xe2\x80\x98\xd7\xb3\xe2\x84\xa2\xd7\xb3\xc3\x97'
decoded1 = decode_one_pass(corrupted_bivit)
print(f"PersonFormModal 'בבית' corrupted decode: {decoded1} = {decoded1.decode('utf-8', errors='replace')}")
print(f"Expected: בבית = {bytes('בבית', 'utf-8')}")
print()

# Now test App.jsx
with open('frontend/src/App.jsx', 'rb') as f:
    app_data = f.read()

# Try one pass decode
decoded_once = decode_one_pass(app_data)
remaining_corrupted = decoded_once.count(b'\xd7\xb3')
print(f"After 1 decode pass: {remaining_corrupted} remaining \xd7\xb3 sequences")

# Try two passes
decoded_twice = decode_one_pass(decoded_once)
remaining_corrupted2 = decoded_twice.count(b'\xd7\xb3')
print(f"After 2 decode passes: {remaining_corrupted2} remaining \xd7\xb3 sequences")

# Try three passes
decoded_thrice = decode_one_pass(decoded_twice)
remaining_corrupted3 = decoded_thrice.count(b'\xd7\xb3')
print(f"After 3 decode passes: {remaining_corrupted3} remaining \xd7\xb3 sequences")

# Show the initialize() error message after decode
idx = decoded_twice.find(b'setError(getErrorMessage(err,')
if idx >= 0:
    chunk = decoded_twice[idx:idx+100]
    print(f"\nAfter 2 passes - setError line: {chunk.decode('utf-8', errors='replace')}")

idx3 = decoded_thrice.find(b'setError(getErrorMessage(err,')
if idx3 >= 0:
    chunk3 = decoded_thrice[idx3:idx3+100]
    print(f"After 3 passes - setError line: {chunk3.decode('utf-8', errors='replace')}")

# Validate the doubly-decoded result is valid UTF-8
try:
    decoded_twice.decode('utf-8')
    print("\nDouble-decoded is valid UTF-8!")
except UnicodeDecodeError as e:
    print(f"\nDouble-decoded has UTF-8 errors: {e}")
