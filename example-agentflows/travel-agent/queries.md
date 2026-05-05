# Travel AI Agent — Example Queries

## MCP Servers & Tools Reference

| Server | Port | Auth | Tools |
|--------|------|------|-------|
| Flight Search | 3001 | None | `search_flights`, `get_flight_details` |
| Hotel Search | 3002 | None | `search_hotels`, `get_hotel_details` |
| Currency Converter | 3003 | None | `convert_currency`, `get_exchange_rates` |
| Booking Manager | 3004 | Asgardeo | `create_booking`, `get_booking`, `cancel_booking` |
| Airport Lounge Access | 3005 | Asgardeo | `search_lounges`, `get_lounge_details`, `reserve_lounge` |

---

## Part 1 — Original 10 Queries

### 3 Queries — 1 Tool Each

**1.** "What are the current exchange rates for US dollars?"

- `get_exchange_rates` (base_currency: "USD")

---

**2.** "I need to cancel booking BK-10021. What's my refund?"

- `cancel_booking` (booking_reference: "BK-10021") *(auth required)*

---

**3.** "Find me economy flights from JFK to London for 2 passengers."

- `search_flights` (origin: "JFK", destination: "LHR", passengers: 2, cabin_class: "economy")

---

### 3 Queries — 2 Tools Each

**4.** "Search for business class flights from JFK to London and show me the full baggage policy and seat map for the first result."

- `search_flights` → `get_flight_details`

---

**5.** "Find hotels in Dubai and give me the full room types and cancellation policy of the highest-rated one."

- `search_hotels` → `get_hotel_details`

---

**6.** "I have 800 euros — how much is that in Japanese yen? Also show me all USD exchange rates for reference."

- `get_exchange_rates` → `convert_currency`

---

### 3 Queries — 4 Tools Each

**7.** "I'm flying from JFK to London. Find me an economy flight, get its full details, search for 5-star hotels in London, and book the flight and hotel together."

- `search_flights` → `get_flight_details` → `search_hotels` → `create_booking` *(auth required)*

---

**8.** "Find economy flights from LAX to Dubai, get the cheapest flight's full details, search for hotels in Dubai, and convert $1,500 to AED so I know my budget."

- `search_flights` → `get_flight_details` → `search_hotels` → `convert_currency`

---

**9.** "Search for hotels in London, get the full details of the best one, look up my existing booking BK-10021, and cancel it so I can rebook."

- `search_hotels` → `get_hotel_details` → `get_booking` → `cancel_booking` *(auth required)*

---

### 1 Query — 6 Tools

**10.** "Plan my full London trip: find economy flights from JFK for 1 passenger, get the full details of the cheapest flight, search for hotels in London, get the full details of the top-rated hotel, book the flight and hotel together, then retrieve the booking to confirm everything is correct."

- `search_flights` → `get_flight_details` → `search_hotels` → `get_hotel_details` → `create_booking` → `get_booking` *(auth required for last 2)*

---

## Part 2 — Additional 10 Queries

### 2 Queries — 1 Tool Each

**11.** "What lounges are available at Heathrow airport? My booking reference is BK-10021."

- `search_lounges` (airport_code: "LHR", booking_reference: "BK-10021") *(auth required)*

---

**12.** "Show me the details of my existing booking BK-10021."

- `get_booking` (booking_reference: "BK-10021") *(auth required)*

---

### 3 Queries — 2 Tools Each

**13.** "I'm departing from JFK. Find the available lounges there for booking BK-10021, then get me the full details of the SkyWings Horizon Lounge."

- `search_lounges` → `get_lounge_details` *(auth required)*

---

**14.** "Find economy flights from LAX to Dubai and convert $1,000 to AED so I know how much spending money I'll have."

- `search_flights` → `convert_currency`

---

**15.** "Retrieve my booking BK-10021, then find all lounges at LHR that I can access with it."

- `get_booking` → `search_lounges` *(auth required)*

---

### 3 Queries — 4 Tools Each

**16.** "I have a layover at JFK. Search for lounges there with booking BK-10021, get the full details of the best lounge, then reserve a slot for 2 guests arriving at 09:30."

- `search_lounges` → `get_lounge_details` → `reserve_lounge` → `get_booking` *(auth required)*

---

**17.** "Find business class flights from JFK to London, get the full details of the first result, search for lounges at LHR for booking BK-10021, and reserve a lounge slot for 1 guest at 14:00."

- `search_flights` → `get_flight_details` → `search_lounges` → `reserve_lounge` *(auth required)*

---

**18.** "Search for hotels in Dubai, get full details of the top-rated one, convert $2,000 to AED to plan my budget, then book the hotel with flight FL-003."

- `search_hotels` → `get_hotel_details` → `convert_currency` → `create_booking` *(auth required)*

---

### 2 Queries — 6 Tools Each

**19.** "Plan my Dubai departure day: check booking BK-10021, find lounges at DXB, get full details of the best lounge, reserve a lounge slot for 09:00 for 2 guests, look up exchange rates for AED, and convert $300 to AED for last-minute spending."

- `get_booking` → `search_lounges` → `get_lounge_details` → `reserve_lounge` → `get_exchange_rates` → `convert_currency` *(auth required)*

---

**20.** "Full Dubai trip from LAX: find economy flights, get the cheapest flight's full details, search 5-star hotels in Dubai, get the top hotel's full details, book the flight and hotel, then reserve a lounge at DXB for the arrival day using the new booking reference."

- `search_flights` → `get_flight_details` → `search_hotels` → `get_hotel_details` → `create_booking` → `reserve_lounge` *(auth required for last 2)*
