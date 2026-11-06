"""Copy only the existing public catalog API into static Pages assets.
No Drive/Sheets credentials are used. Private responses are never requested.
"""
import base64
import hashlib
import json
from pathlib import Path
import re
from urllib.request import urlopen

ENDPOINT = 'https://script.google.com/macros/s/AKfycbx1iHBZOeodXb0zEd5VoSf4euAhLQD-xFithtg-xFUfErfgsT65EZx7-w3a7dt49NF_/exec?action=publicCatalog'
PUBLIC_ROOT = 'https://watbox.net/bingo_3/catalog/'
SECRET = re.compile(r'booth\.pm/gifts/|B3[ES]-[a-f0-9-]+|bingo-image:|[^\s@]+@[^\s@]+\.[^\s@]+', re.I)

def public_text(value, limit=160):
    if not isinstance(value, str) or len(value) > limit or SECRET.search(value):
        raise ValueError('Invalid public text')
    return value

def product_url(value):
    if not value:
        return ''
    if not re.fullmatch(r'https://(?:[a-z0-9-]+\.)?booth\.pm/(?:[a-z]{2}/)?items/\d{1,12}', value):
        raise ValueError('Invalid public product URL')
    return value

def prepare(data):
    if data.get('ok') is not True or data.get('v') != 1 or not isinstance(data.get('items'), list) or len(data['items']) > 1000:
        raise ValueError('Invalid public catalog')
    items, images, seen = [], {}, set()
    for row in data['items']:
        key = row.get('id', '')
        if not re.fullmatch(r'p-[a-f0-9]{20}', key) or key in seen:
            raise ValueError('Invalid public image key')
        seen.add(key)
        item = {k: public_text(row.get(k, '')) for k in ('name', 'award', 'shop', 'provider', 'category', 'platform')}
        if row.get('kind') not in ('single', 'pack'):
            raise ValueError('Invalid kind')
        item.update(id=key, kind=row['kind'], productUrl=product_url(row.get('productUrl', '')), thumbnailUrl='')
        products = row.get('products', [])
        if not isinstance(products, list) or len(products) > 10:
            raise ValueError('Invalid pack')
        item['products'] = [{'name': public_text(p.get('name', '')), 'shop': public_text(p.get('shop', '')), 'url': product_url(p.get('url', ''))} for p in products]
        thumb = row.get('thumbnail', '')
        if thumb:
            if not isinstance(thumb, str) or len(thumb) > 40000 or not re.fullmatch(r'data:image/jpeg;base64,[A-Za-z0-9+/]+={0,2}', thumb):
                raise ValueError('Invalid thumbnail')
            binary = base64.b64decode(thumb.split(',', 1)[1], validate=True)
            if not binary.startswith(b'\xff\xd8\xff') or not binary.endswith(b'\xff\xd9') or len(binary) > 30000:
                raise ValueError('Invalid JPEG')
            name = key + '-' + hashlib.sha256(thumb.encode()).hexdigest()[:20] + '.jpg'
            images[name] = binary
            item['thumbnailUrl'] = PUBLIC_ROOT + 'media/' + name
        items.append(item)
    digest = hashlib.sha256(json.dumps(items, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
    return {'ok': True, 'v': 1, 'updatedAt': public_text(data.get('updatedAt', '')), 'refreshSeconds': 60, 'contentHash': digest, 'items': items}, images

def fetch_json(url):
    with urlopen(url, timeout=90) as response:
        raw = response.read(6000001)
    if len(raw) > 6000000:
        raise ValueError('Public catalog is too large')
    return json.loads(raw)

def publish(output):
    snapshot, images = prepare(fetch_json(ENDPOINT))
    try:
        previous = fetch_json(PUBLIC_ROOT + 'public-catalog.json')
    except Exception:
        previous = {}
    root = Path(output) / 'bingo_3' / 'catalog'
    root.mkdir(parents=True, exist_ok=True)
    media = root / 'media'
    media.mkdir(exist_ok=True)
    for name, binary in images.items():
        (media / name).write_bytes(binary)
    (root / 'public-catalog.json').write_text(json.dumps(snapshot, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    return previous.get('contentHash') != snapshot['contentHash']
