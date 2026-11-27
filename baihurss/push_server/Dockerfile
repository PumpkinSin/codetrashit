FROM python:3.12-alpine
WORKDIR /app/push-server
COPY push_server.py .
ENV PUSH_HOST=0.0.0.0 PUSH_PORT=3457 PUSH_DATA_DIR=/app/push-server/data
EXPOSE 3457
CMD ["python", "-u", "push_server.py"]
