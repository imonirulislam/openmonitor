# syntax=docker/dockerfile:1.7
FROM golang:1.25-alpine AS build
WORKDIR /src
COPY apps/checker/go.mod apps/checker/go.sum ./
COPY apps/checker/*.go ./
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/checker .

FROM gcr.io/distroless/static:nonroot
COPY --from=build /out/checker /checker
USER nonroot:nonroot
ENTRYPOINT ["/checker"]
