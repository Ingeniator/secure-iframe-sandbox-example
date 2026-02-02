.PHONY: demo build

PORT ?= 8080

demo:
	@echo "http://localhost:$(PORT)/demo/unsecure.html"
	@echo "http://localhost:$(PORT)/demo/secure.html"
	@echo "http://localhost:$(PORT)/demo/programmatic.html"
	python3 -m http.server $(PORT)

build:
	cd tests && npm install && npm run build
