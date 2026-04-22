## Remove timezone 
backend sends already converted to site timezone times, we dont need to do anything done regarding timezones on the client side / frontend
we should still show the timezone but not shift or modify dates

~~## Site Colorwheel
In go service
Instead of derive from image
Be "inspired" by the colors
Maybe mute or less loud~~

### Create Schedule Example
overnight shift should look good (shows the time throughout the day)
this is how google calendar works copy them
### what to do
create schedule with nobody assigned
9pm to 7am next day
then assign users to that shift
card expands past to both days

### Note on how schedules work
In node, I wrote code that combined 2 schedules into 1. For example, one for monday at 9-minight, then midnight to 8am shows up as 1 in the front end.
In our v2, I think we can probably deprecate that and have the backend create 1 db row that spans 2 days.

## Extras
In frontend, move "this month/week" button out of modal and next to prev/next button

---
### HOLD DO NOT DO

Chris going to write something up for this
## Create/Edit Caseload
caseload schedule is the source of truth
caseload table has all the schedules
start and end time are needed