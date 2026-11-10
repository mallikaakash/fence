# Gateway Cloud Run env vars — source from deploy/update scripts only.
# Keeps native GCS state, testnet, and on-chain AuthZ aligned across partial updates.
#
# Usage (after gateway-cloudrun-scale.sh):
#   GW_CLOUDRUN_STATE_ENV_FLAGS=(--update-env-vars "${GW_GATEWAY_ENV_CSV}")
#   gcloud run services update … "${GW_CLOUDRUN_SCALE_FLAGS[@]}" "${GW_CLOUDRUN_STATE_ENV_FLAGS[@]}"

GW_GATEWAY_ENV_CSV="DOCKER=1,INJECTIVE_NETWORK=testnet,INTENTGUARD_EXECUTE=1,INTENTGUARD_REQUIRE_DATA_KEY=1,INTENTGUARD_DATA_DIR=/data/.intentguard,INTENTGUARD_REQUIRE_ONCHAIN_GRANT=1,INTENTGUARD_STATE_BACKEND=gcs,INTENTGUARD_REQUIRE_GCS_STATE=1"
