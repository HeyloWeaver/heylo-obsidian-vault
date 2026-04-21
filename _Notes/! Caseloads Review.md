~~NOW Figure out why jwt not connected~~

~~remove "beta" and make it "real" as its real no matter what~~

FRONTEND AS LITTLE AS POSSIBLE - backend should do all the logic and backend has the logic for frontend

set up GO and push to prod today

TIMEZONE 
backend should know the timzeone
db is UTC, but backend should convert the timzeone to the current location's timzeone
Backend sorting/filtering as well

NO hardcoded values, use ENUMS and constants for all values

Data manipulations should be OUTSIDE the component
Put the data manipulations in a hook and import

~~do we have a plan for logged out experience?~~
**yes - it is "access restricted"**

moving away from cookies - be aware of that
DONT USE MIDDLEWARE FOR AUTH - we are moving away from vercel

build GO:
build app with overrides
CLI command for this
SOurce version - change branch name

getcaseloadschedule.go is where we will be doing all our logic and moving everything in client to