.PHONY: lint check_dupes check_missing_images install lint-ru validate-ru draft-ru

sources := $(sort $(wildcard ./exercises/**.json))

lint:
		check-jsonschema --schemafile ./schema.json $(sources)
check_dupes:
		# check for duplicate id's, if there's ID's listed here
		# we've got duplicate id's that need to be resolved
		jq -s ".[]" $(sources) | jq '.id' | sort | uniq -d
# list exercise JSON files with an empty images array
check_missing_images:
		@jq -r 'select(.images | length == 0) | input_filename' $(sources)
install:
		pip install check-jsonschema
dist/exercises.json: $(sources)
		# requires jq
		# brew install jq (for macos)
		jq -s '.' $^ > $@
dist/exercises.nd.json: $(sources)
		# output to new line delimited JSON
		# for use to import into PostgreSQL via the COPY command
		#
	  # https://konbert.com/blog/import-json-into-postgres-using-copy
		# https://www.postgresql.org/docs/current/sql-copy.html
		jq -s '.[]' $^ > $@
dist/exercises.csv: dist/exercises.json
		# output to csv format
		# requires in2csv which is part of
		# https://csvkit.readthedocs.io/
		in2csv ./dist/exercises.json > $@

# ---------------------------------------------------------------------------
# Russian localization (i18n/ru/*.json + scripts/*.mjs) — RU fork additions.
# Upstream targets above are untouched; RU files live outside exercises/
# so upstream wildcard/schemas are not affected.
# ---------------------------------------------------------------------------
RU_SOURCES := $(sort $(wildcard ./i18n/ru/*.json))

lint-ru:
		# validate every RU sidecar against i18n/ru/schema.ru.json
		# requires check-jsonschema (see `make install`)
		check-jsonschema --schemafile ./i18n/ru/schema.ru.json $(RU_SOURCES)

validate-ru:
		# coverage / duplicates / alias collisions / orphan files
		node scripts/validate-localization.mjs

draft-ru:
		# regenerate machine drafts for untranslated exercises only
		node scripts/draft-ru-names.mjs

dist/exercises.ru.json: $(sources) $(RU_SOURCES) scripts/generate-ru-dist.mjs
		# merge upstream exercises with RU localization into one file
		node scripts/generate-ru-dist.mjs
