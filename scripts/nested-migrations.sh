find . -mindepth 1 -type f -name '*.sql' -exec psql -d $POSTGRES_DB -U $POSTGRES_USER --file=\{} \;
