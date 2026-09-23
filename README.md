# BTL Campaigns Authorizations

Registre administratif des autorisations nécessaires aux campagnes BTL Africa. L’application réutilise la base Supabase et les comptes existants du projet `btl-africa-user-registration`.

## Fonctionnalités

L’écran de connexion utilise le même couple MSISDN / mot de passe que les autres outils BTL. La session est conservée localement pour éviter une reconnexion inutile sur le même appareil. Le projet Supabase partagé est intégré par défaut dans l’application : un nouvel appareil ne demande donc plus de saisir l’URL ou la clé.

Après connexion, les utilisateurs administratifs — superviseur, coordination, administrateur et super-administrateur — voient les campagnes disponibles. Chaque campagne possède son registre d’autorisations, avec un affichage priorisant les autorisations encore en attente.

Une autorisation contient un libellé, une référence interne facultative, un service contacté, un destinataire facultatif, une priorité, une période de validité et une description. La date de début reste optionnelle. Lorsqu’elle est renseignée, une date de fin est obligatoire sauf si l’autorisation est déclarée **pérenne / définitive**.

Une autorisation est créée avec le statut **En attente**. La personne qui la reçoit peut la marquer **Reçue**, à condition de joindre une photo de preuve. La preuve, la date de réception et l’identité du compte confirmateur sont conservées en base.

Les campagnes peuvent être créées par les rôles `admin` et `super_admin`. Les autorisations peuvent être créées et modifiées par les rôles `supervisor`, `sub_admin`, `admin` et `super_admin`.

Le cockpit de campagne ajoute une fiche de pilotage indépendante du registre d’autorisations. Elle centralise le client, le porteur du projet, le responsable de projet, les responsables médias, opérations terrain et autorisations, le budget réellement alloué, la proforma, la circonscription et une chronologie de jalons. Michael reste le financier permanent ; Eldo est le support IT permanent et Ruth son backup. Les superviseurs sont affectés au niveau de chaque campagne dans une table dédiée, sans réutiliser `users.supervisor_id`, qui conserve son sens historique dans les autres outils.

Les jalons permettent de suivre les points de passage du brief, de la proforma, des autorisations, des médias, des opérations, du lancement et du reporting. Les échéances dépassées sont signalées dans la chronologie ; une campagne en pause reste distincte d’une absence ou d’un retard opérationnel.

## Migration Supabase

Dans le projet Supabase partagé, ouvrir le SQL Editor et exécuter uniquement la migration suivante si elle n’a pas déjà été exécutée :

```text
supabase/migrations/202609220001_campaign_authorizations.sql
```

Cette migration :

- crée `public.campaign_authorizations` ;
- référence les tables existantes `public.users` et `public.campaigns` ;
- ajoute les contraintes de priorité, statut et période ;
- active la RLS sur la nouvelle table ;
- expose des RPC contrôlées par rôle pour lire les campagnes, lire les autorisations, créer/modifier une autorisation, créer une campagne et confirmer une réception.

La migration suppose que les tables existantes `public.users` et `public.campaigns` sont déjà présentes dans la base BTL, comme dans le projet d’origine.

Cette migration est **complémentaire** aux migrations du dépôt `btl-africa-user-registration` : elle ne recrée pas les utilisateurs, les profils, les campagnes ou les affectations. Si tu as déjà exécuté `202609220001_campaign_authorizations.sql`, ne l’exécute pas une deuxième fois ; l’application utilise directement les tables et RPC qu’elle a créées.

### Extension cockpit projet

La migration `supabase/migrations/202609230006_campaign_cockpit.sql` est additive et doit être exécutée après la migration des autorisations. Elle crée uniquement `campaign_cockpit_details`, `campaign_cockpit_supervisors` et `campaign_cockpit_milestones`, ainsi que des RPC dédiées. Elle ne renomme, ne supprime et ne restructure aucune table existante. Tant qu’elle n’est pas exécutée, le registre historique continue de fonctionner et la fiche cockpit reste vide.

## Configuration locale

Installer les dépendances puis lancer le projet :

```bash
pnpm install
pnpm dev
```

La configuration par défaut pointe vers le projet Supabase BTL partagé. Pour un autre environnement, les variables `VITE_SUPABASE_URL` et `VITE_SUPABASE_PUBLISHABLE_KEY` / `VITE_SUPABASE_ANON_KEY` restent supportées. La clé intégrée est une clé publishable/anon, jamais une clé `service_role`.

## Principes d’interface

L’interface reste volontairement parcimonieuse : contrôles custom, modales centrées sur le viewport, états vides explicites, animations discrètes et responsive mobile. Le fond aurora et les surfaces translucides reprennent la direction BTL Africa sans ajouter de bibliothèque UI supplémentaire au parcours métier.

## Validation

Les contrôles disponibles sont :

```bash
pnpm check
pnpm build
```

## Publication GitHub Pages

Le dépôt est configuré pour publier la racine de la branche `main`. Après une modification de l’application, reconstruire puis recopier le contenu de `dist/public` à la racine avant de pousser :

```bash
pnpm build
cp -R dist/public/. .
touch .nojekyll
git add . && git commit -m "build: update GitHub Pages artifact" && git push
```
