import base64
import hashlib
import unittest
from publish_prize_catalog import prepare

class CatalogPublishingTests(unittest.TestCase):
    def row(self):
        thumb = 'data:image/jpeg;base64,' + base64.b64encode(bytes.fromhex('ffd8ffe00004ffd9')).decode()
        return {'id':'p-'+'a'*20,'name':'景品','kind':'single','thumbnail':thumb,'email':'private@example.com','giftUrl':'https://booth.pm/gifts/secret'}
    def data(self,row):
        return {'ok':True,'v':1,'updatedAt':'2026-11-06T00:00:00Z','items':[row]}
    def test_only_public_fields_and_jpeg_are_published(self):
        row=self.row();snapshot,images=prepare(self.data(row))
        item=snapshot['items'][0]
        self.assertNotIn('email',item);self.assertNotIn('giftUrl',item);self.assertNotIn('thumbnail',item)
        expected=row['id']+'-'+hashlib.sha256(row['thumbnail'].encode()).hexdigest()[:20]+'.jpg'
        self.assertEqual(list(images),[expected]);self.assertTrue(item['thumbnailUrl'].endswith(expected))
    def test_high_quality_jpeg_above_old_limit(self):
        row=self.row()
        row['thumbnail']='data:image/jpeg;base64,'+base64.b64encode(bytes.fromhex('ffd8ff')+bytes(60000)+bytes.fromhex('ffd9')).decode()
        _,images=prepare(self.data(row))
        self.assertGreater(len(next(iter(images.values()))),30000)
        row['thumbnail']='data:image/jpeg;base64,'+base64.b64encode(bytes.fromhex('ffd8ff')+bytes(225000)+bytes.fromhex('ffd9')).decode()
        with self.assertRaises(ValueError):prepare(self.data(row))
    def test_invalid_and_secret_data_are_rejected(self):
        for field,value in [('id','../secret'),('name','https://booth.pm/gifts/secret'),('thumbnail','data:image/jpeg;base64,AAAA'),('productUrl','https://evil.test/')]:
            row=self.row();row[field]=value
            with self.assertRaises(ValueError):prepare(self.data(row))
    def test_removed_rows_remove_images_and_change_hash(self):
        first,_=prepare(self.data(self.row()));empty,images=prepare({'ok':True,'v':1,'items':[]})
        self.assertEqual(images,{});self.assertNotEqual(first['contentHash'],empty['contentHash'])
    def test_timestamp_does_not_trigger_republication(self):
        a,_=prepare(self.data(self.row()));data=self.data(self.row());data['updatedAt']='later';b,_=prepare(data)
        self.assertEqual(a['contentHash'],b['contentHash'])

if __name__=='__main__':unittest.main()
