FROM golang:1.23-alpine AS builder

WORKDIR /app

COPY go.mod ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /bin/campus-wall-backend .

FROM alpine:3.20

WORKDIR /app

ENV PORT=8000
ENV DATABASE_URL=sqlite:///./data/campus_wall.db
ENV UPLOAD_DIR=./data/uploads

COPY --from=builder /bin/campus-wall-backend /usr/local/bin/campus-wall-backend

RUN mkdir -p /app/data/uploads

EXPOSE 8000

CMD ["campus-wall-backend"]
