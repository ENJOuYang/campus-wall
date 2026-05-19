package main

import (
	"log"
	"net/http"
)

func main() {
	cfg, err := LoadConfig()
	if err != nil {
		log.Fatalf("load config: %v", err)
	}

	server, err := NewServer(cfg)
	if err != nil {
		log.Fatalf("create server: %v", err)
	}
	defer server.Close()

	log.Printf("listening on %s", cfg.Port)
	if err := http.ListenAndServe(cfg.Port, server.Handler()); err != nil {
		log.Fatalf("listen: %v", err)
	}
}
