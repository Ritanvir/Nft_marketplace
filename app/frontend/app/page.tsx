"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Metaplex, walletAdapterIdentity } from "@metaplex-foundation/js";

// ✅ No-SSR wallet button (fix hydration mismatch)
const WalletMultiButtonNoSSR = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false }
);

type UploadResponse = {
  metadataUrl: string; // ipfs://...
  metadataGatewayUrl?: string; // https://.../ipfs/<cid>
  imageIpfs?: string; // ipfs://...
  imageGatewayUrl?: string; // https://.../ipfs/<cid>
};

export default function Page() {
  const { connection } = useConnection();
  const wallet = useWallet();

  const [name, setName] = useState("My NFT");
  const [description, setDescription] = useState("Demo NFT on Devnet");
  const [file, setFile] = useState<File | null>(null);

  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const [mintAddress, setMintAddress] = useState<string | null>(null);

  const [metadataUrl, setMetadataUrl] = useState<string | null>(null);
  const [metadataGatewayUrl, setMetadataGatewayUrl] = useState<string | null>(null);
  const [imageGatewayUrl, setImageGatewayUrl] = useState<string | null>(null);

  // Metaplex client
  const metaplex = useMemo(() => {
    if (!wallet.publicKey) return null;
    return Metaplex.make(connection).use(walletAdapterIdentity(wallet as any));
  }, [connection, wallet.publicKey, wallet]);

  async function uploadToStorage(): Promise<string> {
    if (!file) throw new Error("Please select an image first");

    setStatus("Uploading image + metadata to Filebase (IPFS)...");
    const formData = new FormData();
    formData.append("file", file);
    formData.append("name", name);
    formData.append("description", description);

    const res = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });

    // ✅ Safe parsing (so HTML/empty doesn't crash)
    const text = await res.text();
    let data: UploadResponse | any = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(
        `Upload API returned non-JSON response.\nStatus: ${res.status}\nBody: ${text?.slice(0, 300) || "(empty)"}`
      );
    }

    if (!res.ok) throw new Error(data?.error || `Upload failed (status ${res.status})`);
    if (!data?.metadataUrl) throw new Error("Upload succeeded but metadataUrl missing from response.");

    // Save nice-to-show links
    setMetadataUrl(data.metadataUrl);
    setMetadataGatewayUrl(data.metadataGatewayUrl || null);
    setImageGatewayUrl(data.imageGatewayUrl || null);

    // Return ipfs://... to mint
    return data.metadataUrl as string;
  }

  async function mintNft() {
    if (!wallet.connected || !wallet.publicKey) throw new Error("Connect wallet first (Phantom Devnet).");
    if (!metaplex) throw new Error("Metaplex not ready yet");
    if (!file) throw new Error("Please select an image first");

    setBusy(true);
    setMintAddress(null);

    try {
      // 1) Upload metadata (Filebase IPFS)
      const uri = await uploadToStorage();

      // 2) Mint NFT
      setStatus("Minting NFT on Solana Devnet...");
      const { nft } = await metaplex.nfts().create({
        uri, // ipfs://CID from Filebase
        name,
        sellerFeeBasisPoints: 0,
      });

      setMintAddress(nft.address.toBase58());
      setStatus("✅ NFT Minted!");
    } finally {
      setBusy(false);
    }
  }

  const explorerUrl = mintAddress
    ? `https://explorer.solana.com/address/${mintAddress}?cluster=devnet`
    : null;

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <h1 style={{ marginBottom: 8 }}>Upload Image → Mint NFT (Solana Devnet)</h1>
      <p style={{ opacity: 0.75, marginTop: 0 }}>
        Steps: Connect wallet → Choose image → Upload (Filebase IPFS) → Mint
      </p>

      <WalletMultiButtonNoSSR />

      <div
        style={{
          marginTop: 18,
          padding: 16,
          border: "1px solid #ddd",
          borderRadius: 12,
          display: "grid",
          gap: 12,
        }}
      >
        <label>
          <div style={{ fontWeight: 600 }}>Name</div>
          <input
            style={{ width: "100%", padding: 10, marginTop: 6 }}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Gun Skin #1"
          />
        </label>

        <label>
          <div style={{ fontWeight: 600 }}>Description</div>
          <textarea
            style={{ width: "100%", padding: 10, marginTop: 6, minHeight: 90 }}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Short description..."
          />
        </label>

        <label>
          <div style={{ fontWeight: 600 }}>Image (png/jpg/webp)</div>
          <input
            style={{ display: "block", marginTop: 6 }}
            type="file"
            accept="image/*"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
          {file && (
            <div style={{ marginTop: 6, fontSize: 13, opacity: 0.8 }}>
              Selected: {file.name} ({Math.round(file.size / 1024)} KB)
            </div>
          )}
        </label>

        <button
          style={{
            padding: 12,
            cursor: busy ? "not-allowed" : "pointer",
            opacity: busy ? 0.7 : 1,
          }}
          onClick={() =>
            mintNft().catch((e: any) => {
              setBusy(false);
              setStatus("❌ " + (e?.message || String(e)));
            })
          }
          disabled={!wallet.connected || busy}
        >
          {busy ? "Working..." : "Upload & Mint NFT"}
        </button>

        <div style={{ whiteSpace: "pre-wrap" }}>{status}</div>

        {metadataUrl && (
          <div>
            <div style={{ fontWeight: 600 }}>Metadata URI (used for mint)</div>
            <code style={{ display: "block", marginTop: 6 }}>{metadataUrl}</code>

            {metadataGatewayUrl && (
              <div style={{ marginTop: 8 }}>
                <a href={metadataGatewayUrl} target="_blank" rel="noreferrer">
                  Open Metadata in Browser
                </a>
              </div>
            )}
          </div>
        )}

        {imageGatewayUrl && (
          <div>
            <div style={{ fontWeight: 600 }}>Image Preview</div>
            <a href={imageGatewayUrl} target="_blank" rel="noreferrer">
              Open Image
            </a>
          </div>
        )}

        {mintAddress && (
          <div>
            <div style={{ fontWeight: 600 }}>Mint Address</div>
            <code style={{ display: "block", marginTop: 6 }}>{mintAddress}</code>
            {explorerUrl && (
              <div style={{ marginTop: 8 }}>
                <a href={explorerUrl} target="_blank" rel="noreferrer">
                  Open in Solana Explorer (Devnet)
                </a>
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ marginTop: 16, opacity: 0.7, fontSize: 13 }}>
        Notes:
        <ul>
          <li>Phantom → network Devnet select করুন।</li>
          <li>Filebase bucket অবশ্যই IPFS backend হতে হবে, নাহলে CID পাবেন না।</li>
        </ul>
      </div>
    </div>
  );
}
