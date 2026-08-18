import requests
import json

data = {
    'name': 'Alice',
    'email': 'alice@test.com',
    'password': 'password123'
}

response = requests.post('http://localhost:5000/register', json=data)
print('Status:', response.status_code)
print('Response:', json.dumps(response.json(), indent=2))
