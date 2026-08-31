import { S3Client, ListBucketsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

async function main() {
  const client = new S3Client({
    endpoint: 'http://localhost:9000',
    region: 'us-east-1',
    credentials: {
      accessKeyId: 'minioadmin',
      secretAccessKey: 'minioadminpassword',
    },
    forcePathStyle: true,
  });

  try {
    console.log('Listing buckets in local MinIO...');
    const buckets = await client.send(new ListBucketsCommand({}));
    console.log('Buckets:', buckets.Buckets?.map(b => b.Name));

    for (const b of buckets.Buckets || []) {
      if (b.Name) {
        console.log(`\nListing objects in bucket "${b.Name}"...`);
        const objs = await client.send(new ListObjectsV2Command({ Bucket: b.Name, MaxKeys: 10 }));
        console.log(`Objects (max 10):`, objs.Contents?.map(o => o.Key));
      }
    }
  } catch (err) {
    console.error('MinIO connection failed:', err);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
