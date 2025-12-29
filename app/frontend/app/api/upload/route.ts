import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";

export const runtime = "nodejs";

function mustEnv(key: string) {
  const v = process.env[key];
  if (!v) throw new Error(`Missing ${key} in .env.local`);
  return v.trim().replace(/^"+|"+$/g, "");
}

function randomKey(prefix: string, filename: string) {
  const safe = filename.replace(/\s+/g, "_");
  return `${prefix}/${Date.now()}-${Math.random().toString(16).slice(2)}-${safe}`;
}

async function getCidByHead(s3: S3Client, bucket: string, key: string) {
  const head = await s3.send(
    new HeadObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );

  // Filebase keeps CID in object metadata for IPFS buckets
  const cid =
    (head as any)?.Metadata?.cid ||
    (head as any)?.Metadata?.CID ||
    (head as any)?.$metadata?.httpHeaders?.["x-amz-meta-cid"] ||
    (head as any)?.$metadata?.httpHeaders?.["X-Amz-Meta-Cid"];

  return cid as string | undefined;
}

export async function POST(req: Request) {
  try {
    const accessKeyId = mustEnv("FILEBASE_ACCESS_KEY");
    const secretAccessKey = mustEnv("FILEBASE_SECRET_KEY");
    const bucket = mustEnv("FILEBASE_BUCKET");
    const endpoint = mustEnv("FILEBASE_S3_ENDPOINT"); // https://s3.filebase.com
    const gateway = mustEnv("FILEBASE_GATEWAY");      // https://ipfs.filebase.io/ipfs

    const form = await req.formData();
    const file = form.get("file") as File | null;
    const name = (form.get("name") as string) || "My NFT";
    const description = (form.get("description") as string) || "";

    if (!file) {
      return new Response(JSON.stringify({ error: "File missing" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (!file.type.startsWith("image/")) {
      return new Response(JSON.stringify({ error: "Only image files are allowed" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const s3 = new S3Client({
      endpoint,
      region: "us-east-1",
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true,
    });

    // ---- 1) Upload Image ----
    const imgKey = randomKey("images", file.name);
    const imgBytes = new Uint8Array(await file.arrayBuffer());

    const putImg = await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: imgKey,
        Body: imgBytes,
        ContentType: file.type,
      })
    );

    // Try CID from PutObject headers first
    const imgHeaders = (putImg as any)?.$metadata?.httpHeaders || {};
    let imgCid =
      imgHeaders["x-amz-meta-cid"] ||
      imgHeaders["X-Amz-Meta-Cid"];

    // ✅ If not found, use HeadObject (more reliable)
    if (!imgCid) {
      imgCid = await getCidByHead(s3, bucket, imgKey);
    }

    if (!imgCid) {
      return new Response(
        JSON.stringify({
          error:
            "CID missing from upload response (even after HeadObject). নিশ্চিত হন Filebase bucket backend = IPFS এবং endpoint = https://s3.filebase.com",
          hint:
            "Filebase dashboard → Buckets → select bucket → backend/network must be IPFS. If not, create a new IPFS bucket.",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const imageIpfs = `ipfs://${imgCid}`;
    const imageGatewayUrl = `${gateway}/${imgCid}`;

    // ---- 2) Create & Upload metadata.json ----
    const metadata = {
      name,
      description,
      image: imageIpfs,
      properties: {
        files: [{ uri: imageIpfs, type: file.type }],
        category: "image",
      },
    };

    const metaKey = randomKey("metadata", "metadata.json");
    const metaBody = Buffer.from(JSON.stringify(metadata, null, 2), "utf-8");

    const putMeta = await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: metaKey,
        Body: metaBody,
        ContentType: "application/json",
      })
    );

    const metaHeaders = (putMeta as any)?.$metadata?.httpHeaders || {};
    let metaCid =
      metaHeaders["x-amz-meta-cid"] ||
      metaHeaders["X-Amz-Meta-Cid"];

    if (!metaCid) {
      metaCid = await getCidByHead(s3, bucket, metaKey);
    }

    if (!metaCid) {
      return new Response(
        JSON.stringify({
          error:
            "Metadata CID missing (even after HeadObject). Bucket IPFS-backed না হলে CID পাওয়া যাবে না।",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const metadataUrl = `ipfs://${metaCid}`;
    const metadataGatewayUrl = `${gateway}/${metaCid}`;

    return new Response(
      JSON.stringify({
        metadataUrl,
        metadataGatewayUrl,
        imageIpfs,
        imageGatewayUrl,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    console.error("UPLOAD ROUTE ERROR:", e);
    return new Response(JSON.stringify({ error: e?.message || "Upload failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
