# Renforcement backend - Microservices

## Stack

- Langage : [Typescript](https://typescriptlang.org)
- Serveur web : [HonoJS](https://npmjs.com/_/hono)
- Découverte de services : [Consul](https://consul.io)
- JWT : [jsonwebtoken](https://npmjs.com/_/jsonwebtoken)
- Hashage de mot de passe : [Argon2](https://npmjs.com/@node-rs/argon2)
- Base de donnée : [Postgresql](https://postgresql.org) & [MongoDB](https://www.mongodb.com/)

## Lancer le projet

1. Copier `.env.example` dans `.env` et remplir les valeurs
2. Utiliser la commande `docker compose --profile '*' up` pour lancer tous les services.

Les profils disponibles sont :

- `auth`
- `school`
- `student` (dépend de `school`)
