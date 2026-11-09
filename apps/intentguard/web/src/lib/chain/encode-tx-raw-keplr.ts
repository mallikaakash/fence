import { CosmosTxV1Beta1TxPb } from "@injectivelabs/sdk-ts";

/** Keplr `sendTx` expects protobuf-encoded TxRaw bytes (sdk-ts v2 uses `toBinary`, not `encode`). */
export function encodeTxRawForKeplr(txRaw: unknown): Uint8Array {
  if (txRaw instanceof Uint8Array) return txRaw;
  return CosmosTxV1Beta1TxPb.TxRaw.toBinary(
    txRaw as Parameters<typeof CosmosTxV1Beta1TxPb.TxRaw.toBinary>[0],
  );
}
