# EKS deployment

Skeleton manifests. Search for `TODO` and `REGISTRY` markers — they call out values that
must be set per-environment (your ECR path, ingress hosts, RDS connection string, etc.).

## Prerequisites

- An EKS cluster with an ingress controller (AWS Load Balancer Controller or nginx).
- A Postgres database (RDS / Aurora) reachable from the cluster.
- A secret manager. The `secrets.example.yaml` is a literal Secret as a starting point,
  but production should use ExternalSecrets / SealedSecrets / sops-encrypted manifests.
- A container registry (ECR). Build and push images:

```bash
docker build -t $REG/open-monitor-api:$TAG -f deploy/docker/api.Dockerfile .
docker build -t $REG/open-monitor-web:$TAG -f deploy/docker/web.Dockerfile .
docker build -t $REG/open-monitor-page:$TAG -f deploy/docker/status-page.Dockerfile .
docker build -t $REG/open-monitor-notifier:$TAG -f deploy/docker/notifier.Dockerfile .
docker build -t $REG/open-monitor-checker:$TAG -f deploy/docker/checker.Dockerfile .
docker push $REG/open-monitor-api:$TAG  # ...etc
```

## Apply order

```bash
# 1. Namespace
kubectl apply -f deploy/k8s/namespace.yaml

# 2. Secrets (replace the example with your real secret-management flow first)
kubectl apply -f deploy/k8s/secrets.example.yaml

# 3. Migrate the database
kubectl apply -f deploy/k8s/migrate-job.yaml --replace
kubectl -n open-monitor wait --for=condition=complete --timeout=120s job/db-migrate

# 4. Apps
kubectl apply -f deploy/k8s/api.yaml
kubectl apply -f deploy/k8s/notifier.yaml
kubectl apply -f deploy/k8s/checker.yaml
kubectl apply -f deploy/k8s/web.yaml
kubectl apply -f deploy/k8s/status-page.yaml

# 5. Ingress (after DNS / certs are ready)
kubectl apply -f deploy/k8s/ingress.yaml
```

## Hosts

The ingress assumes three hostnames — set them in your DNS:

| Hostname              | Service     |
|-----------------------|-------------|
| `status.example.com`  | status-page |
| `status-admin.example.com` | web (admin) |
| `status-api.example.com`   | api         |

You can collapse to a single host with path routing if preferred — adjust `ingress.yaml`
accordingly. Don't expose the api on the same host as admin without auth in front of it.

## Multi-region probing

Run one `checker` Deployment per region cluster, with a unique `CHECKER_REGION` env. They
all post results to the same API. The admin UI doesn't yet split status by region — that's
a future enhancement.
