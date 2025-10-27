#!/bin/bash
# Quick testing script for fast iteration
# Usage: ./test-api.sh [command]

BASE_URL="http://localhost:3000"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Hackathon API Test Script ===${NC}\n"

case "$1" in
  "health")
    echo -e "${GREEN}Testing health check...${NC}"
    curl -s "$BASE_URL/" | python3 -m json.tool
    ;;

  "twilio")
    echo -e "${GREEN}Testing Twilio connectivity...${NC}"
    curl -s "$BASE_URL/api/check-twilio" | python3 -m json.tool
    ;;

  "send")
    if [ -z "$2" ]; then
      echo -e "${RED}Usage: ./test-api.sh send <phone_number> [message]${NC}"
      exit 1
    fi
    MESSAGE="${3:-Hello from hackathon test script!}"
    echo -e "${GREEN}Sending SMS to $2...${NC}"
    curl -s -X POST "$BASE_URL/api/send-sms" \
      -H "Content-Type: application/json" \
      -d "{\"to\":\"$2\",\"body\":\"$MESSAGE\"}" | python3 -m json.tool
    ;;

  "whatsapp")
    if [ -z "$2" ]; then
      echo -e "${RED}Usage: ./test-api.sh whatsapp <phone_number> [message]${NC}"
      exit 1
    fi
    MESSAGE="${3:-Hello from hackathon AI matchmaker!}"
    echo -e "${GREEN}Sending WhatsApp message to $2...${NC}"
    # Use a temp file to avoid JSON escaping issues
    TEMP_FILE=$(mktemp)
    cat > "$TEMP_FILE" <<EOF
{"to":"$2","body":"$MESSAGE"}
EOF
    curl -s -X POST "$BASE_URL/api/send-whatsapp" \
      -H "Content-Type: application/json" \
      -d @"$TEMP_FILE" | python3 -m json.tool
    rm -f "$TEMP_FILE"
    ;;

  "test-ai")
    if [ -z "$2" ]; then
      echo -e "${RED}Usage: ./test-api.sh test-ai <phone_number> <message>${NC}"
      exit 1
    fi
    if [ -z "$3" ]; then
      echo -e "${RED}Usage: ./test-api.sh test-ai <phone_number> <message>${NC}"
      exit 1
    fi
    MESSAGE="$3"
    echo -e "${GREEN}Testing AI with message: $MESSAGE${NC}"
    TEMP_FILE=$(mktemp)
    cat > "$TEMP_FILE" <<EOF
{"phoneNumber":"$2","message":"$MESSAGE"}
EOF
    curl -s -X POST "$BASE_URL/api/test-ai" \
      -H "Content-Type: application/json" \
      -d @"$TEMP_FILE" | python3 -m json.tool
    rm -f "$TEMP_FILE"
    ;;

  "ai-state")
    if [ -z "$2" ]; then
      echo -e "${RED}Usage: ./test-api.sh ai-state <phone_number>${NC}"
      exit 1
    fi
    echo -e "${GREEN}Getting conversation state for $2...${NC}"
    curl -s "$BASE_URL/api/conversation/$2" | python3 -m json.tool
    ;;

  "ai-reset")
    if [ -z "$2" ]; then
      echo -e "${RED}Usage: ./test-api.sh ai-reset <phone_number>${NC}"
      exit 1
    fi
    echo -e "${GREEN}Resetting conversation for $2...${NC}"
    curl -s -X POST "$BASE_URL/api/conversation/$2/reset" | python3 -m json.tool
    ;;

  "conversations")
    echo -e "${GREEN}Listing conversations...${NC}"
    curl -s "$BASE_URL/api/conversations" | python3 -m json.tool
    ;;

  "verified")
    echo -e "${GREEN}Listing verified phone numbers...${NC}"
    curl -s "$BASE_URL/api/verified-numbers" | python3 -m json.tool
    ;;

  "verify")
    if [ -z "$2" ]; then
      echo -e "${RED}Usage: ./test-api.sh verify <phone_number> [friendly_name]${NC}"
      exit 1
    fi
    FRIENDLY="${3:-Hackathon Number}"
    echo -e "${GREEN}Starting verification for $2...${NC}"
    echo -e "${BLUE}Get ready to answer a call from Twilio!${NC}"
    curl -s -X POST "$BASE_URL/api/verify-number/start" \
      -H "Content-Type: application/json" \
      -d "{\"phoneNumber\":\"$2\",\"friendlyName\":\"$FRIENDLY\"}" | python3 -m json.tool
    ;;

  "create-conv")
    if [ -z "$2" ]; then
      echo -e "${RED}Usage: ./test-api.sh create-conv <name> <phone1> [phone2] [phone3]${NC}"
      exit 1
    fi
    NAME="$2"
    shift 2
    PARTICIPANTS=$(printf ',"%s"' "$@")
    PARTICIPANTS="[${PARTICIPANTS:1}]"
    echo -e "${GREEN}Creating conversation '$NAME' with participants: $@${NC}"
    curl -s -X POST "$BASE_URL/api/conversations/create" \
      -H "Content-Type: application/json" \
      -d "{\"friendlyName\":\"$NAME\",\"participants\":$PARTICIPANTS}" | python3 -m json.tool
    ;;

  "send-conv")
    if [ -z "$2" ] || [ -z "$3" ]; then
      echo -e "${RED}Usage: ./test-api.sh send-conv <conversation_sid> <message>${NC}"
      exit 1
    fi
    echo -e "${GREEN}Sending message to conversation $2...${NC}"
    curl -s -X POST "$BASE_URL/api/conversations/$2/message" \
      -H "Content-Type: application/json" \
      -d "{\"body\":\"$3\"}" | python3 -m json.tool
    ;;

  *)
    echo "Available commands:"
    echo "  health              - Check server health"
    echo "  twilio              - Check Twilio connectivity"
    echo "  verified            - List verified phone numbers"
    echo "  verify <phone>      - Verify a phone number (Twilio will call)"
    echo "  send <phone> [msg]  - Send test SMS"
    echo "  whatsapp <phone> [msg] - Send WhatsApp message"
    echo "  test-ai <phone> <msg> - Test AI matchmaker (without WhatsApp)"
    echo "  ai-state <phone>    - Get AI conversation state"
    echo "  ai-reset <phone>    - Reset AI conversation"
    echo "  conversations       - List all conversations"
    echo "  create-conv <name> <phone1> [phone2]... - Create group conversation"
    echo "  send-conv <sid> <message> - Send message to conversation"
    echo ""
    echo "Examples:"
    echo "  ./test-api.sh health"
    echo "  ./test-api.sh whatsapp +19193087138 'Hello via WhatsApp!'"
    echo "  ./test-api.sh test-ai +19193087138 'I want to create a profile'"
    echo "  ./test-api.sh ai-state +19193087138"
    echo "  ./test-api.sh ai-reset +19193087138"
    ;;
esac
