# Gateway Cloud Run scaling — source from deploy/update scripts only.
#
# Authoritative execution state uses the GCS JSON API (INTENTGUARD_STATE_BACKEND=gcs).
# The GCS FUSE mount at /data is for config.json and aux files only.
# Only one gateway process may write state. See docs/DEPLOY-GCP.md § "Single-Writer Guarantee".
#
# Two Cloud Run layers (do not conflate):
#   --min / --max              Service-level caps across revisions in traffic split
#   --min-instances / --max-instances   Per-revision template (new revision each change)
#
# Service-level --max 1 is the primary cap on concurrent instances for traffic-
# bearing revisions. Revision-level max-instances 1 is defense-in-depth on each
# template. Neither prevents tagged no-traffic revisions from starting instances
# (see docs). Rollouts must serialize writers — not rely on flags alone.

# shellcheck disable=SC2034
GW_CLOUDRUN_SERVICE_SCALE_FLAGS=(--min 1 --max 1)
# Revision min 0 so drained revisions can scale to zero (old templates keep their own min).
# Warm capacity comes from service-level --min 1 on the traffic-bearing revision.
# shellcheck disable=SC2034
GW_CLOUDRUN_REVISION_SCALE_FLAGS=(--min-instances 0 --max-instances 1)
# shellcheck disable=SC2034
GW_CLOUDRUN_SCALE_FLAGS=(
  "${GW_CLOUDRUN_SERVICE_SCALE_FLAGS[@]}"
  "${GW_CLOUDRUN_REVISION_SCALE_FLAGS[@]}"
)
