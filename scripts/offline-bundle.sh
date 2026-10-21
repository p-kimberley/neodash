#!/bin/sh
# Builds everything needed to install NeoDash in an air-gapped cluster into one directory:
#
#   neodash-offline-<version>/
#     neodash-image-<version>.tar   the NeoDash image (docker save)
#     neodash-<chart-version>.tgz   the Helm chart
#     SHA256SUMS
#     INSTALL.md                    how to load and install it
#
# Run on a machine with internet access, Docker and Helm, from the repository root:
#   scripts/offline-bundle.sh [image-name]      (default image name: neodash)
#
# By default the image is built from this checkout. Set SOURCE_IMAGE to bundle an image that was
# already published instead (CI does this, so the bundle holds exactly the released image):
#   SOURCE_IMAGE=ghcr.io/<owner>/neodash:3.0.0 scripts/offline-bundle.sh
set -eu

IMAGE_NAME="${1:-neodash}"
CHART_DIR="k8s-deploy/neodash"
VERSION="$(sed -n 's/^appVersion: *"\{0,1\}\([^"]*\)"\{0,1\}$/\1/p' "$CHART_DIR/Chart.yaml")"
CHART_VERSION="$(sed -n 's/^version: *//p' "$CHART_DIR/Chart.yaml")"
OUT="neodash-offline-$VERSION"
IMAGE="$IMAGE_NAME:$VERSION"

if [ -n "${SOURCE_IMAGE:-}" ]; then
  echo "Pulling $SOURCE_IMAGE"
  docker pull --platform linux/amd64 "$SOURCE_IMAGE"
  docker tag "$SOURCE_IMAGE" "$IMAGE"
else
  echo "Building $IMAGE"
  docker build -t "$IMAGE" .
fi

rm -rf "$OUT"
mkdir -p "$OUT"
echo "Saving image"
docker save "$IMAGE" -o "$OUT/neodash-image-$VERSION.tar"
echo "Packaging chart"
helm package "$CHART_DIR" --destination "$OUT" >/dev/null

cat > "$OUT/INSTALL.md" <<EOF
# Installing NeoDash $VERSION offline

1. Check the files: \`sha256sum -c SHA256SUMS\`
2. Load the image and push it to your internal registry:

       docker load -i neodash-image-$VERSION.tar
       docker tag $IMAGE <registry>/neodash:$VERSION
       docker push <registry>/neodash:$VERSION

   (Without Docker: \`skopeo copy docker-archive:neodash-image-$VERSION.tar docker://<registry>/neodash:$VERSION\`.)
3. Create the Secrets and install the chart, pointing it at the registry:

       helm install neodash neodash-$CHART_VERSION.tgz -n neodash \\
         --set global.imageRegistry=<registry> --set image.repository=neodash -f my-values.yaml

   The chart's README and defaults: \`helm show readme neodash-$CHART_VERSION.tgz\` and
   \`helm show values neodash-$CHART_VERSION.tgz\`.

See docs/deployment.md in the NeoDash repository for the full deployment guide.
The image makes no outbound internet requests; the chart references no other images.
EOF

(cd "$OUT" && sha256sum ./*.tar ./*.tgz > SHA256SUMS)
echo "Done: $OUT/"
ls -l "$OUT"
