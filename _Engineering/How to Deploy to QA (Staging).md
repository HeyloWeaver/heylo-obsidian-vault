
**Backend**

```
sudo ./bin/deploy.sh
```

**Frontend**

```
rsync -a --exclude node_modules --exclude .next --exclude .vercel \
  /Users/michaelweaver/Websites/Heylo/frontend/ /tmp/heylo-fe-deploy/ && \
cd /tmp/heylo-fe-deploy && \
./bin/deploy.sh \
  -p prj_9u2fHbxZZMTvBLFHpUSGtPXvBCG5 \
  -a https://dev-api.heylo.tech \
  -t tGqAWYdGqknJQNolwQ2Shkus \
  -c us-east-2:2ca8427e-6c7c-4cc0-9f1c-513c60fded8f \
  -w 984649215669 \
  -u 72keil7g6emsltkug4cjeipg9u \
  -g https://bf2e6z4vwnccllnumv3jlsormq.appsync-api.us-east-2.amazonaws.com/graphql
```

**Go**

```
AWS_PROFILE=heylo-dev aws codebuild start-build \
  --region us-east-2 \
  --project-name dev-appsync-deploy \
  --source-version <YOUR_BRANCH_NAME>
```