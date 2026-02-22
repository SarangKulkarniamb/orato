import motor.motor_asyncio
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

MONGODB_URL = os.getenv("MONGODB_URL")

client = motor.motor_asyncio.AsyncIOMotorClient(MONGODB_URL)

db = client.orato_db
UserCollection = db.users

async def init_db():
    await UserCollection.create_index("email", unique=True)

# --- ADD THIS HELPER FUNCTION ---
async def retrieve_user(email: str):
    user = await UserCollection.find_one({"email": email})
    return user